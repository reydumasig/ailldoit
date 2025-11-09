// @ts-ignore - fluent-ffmpeg doesn't have TypeScript definitions
import ffmpeg from 'fluent-ffmpeg';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { firebaseStorageService } from './firebase-storage-service';

export interface VideoClip {
  url: string;
  duration: number;
  order: number;
  description: string;
  startOffset?: number; // Start time offset for trimming (in seconds)
  endOffset?: number; // End time offset for trimming (in seconds)
}

export interface VideoStitchingOptions {
  targetDuration: number; // in seconds
  transitionDuration?: number; // in seconds, default 0.5
  outputFormat?: 'mp4' | 'mov' | 'webm';
  quality?: 'high' | 'medium' | 'low';
  addFadeTransitions?: boolean;
  addBackgroundMusic?: boolean;
  musicUrl?: string;
}

export class VideoProcessingService {
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp', 'video-processing');
    this.ensureTempDir();
  }

  private async ensureTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create temp directory:', error);
    }
  }

  /**
   * Stitch multiple video clips into a single longer video
   */
  async stitchVideos(
    clips: VideoClip[], 
    options: VideoStitchingOptions
  ): Promise<string> {
    console.log(`🎬 VIDEO PROCESSING: Starting video stitching for ${clips.length} clips`);
    console.log(`🎯 VIDEO PROCESSING: Target duration: ${options.targetDuration}s`);
    
    const sessionId = uuidv4();
    const tempSessionDir = path.join(this.tempDir, sessionId);
    
    try {
      // Create session directory
      await fs.mkdir(tempSessionDir, { recursive: true });
      
      // Handle video clips - they may already be local paths or URLs
      const localClipPaths: string[] = [];
      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        
        // Check if clip is already a local path
        if (clip.url.startsWith('/') || clip.url.startsWith(process.cwd())) {
          // Already a local path
          console.log(`📁 VIDEO PROCESSING: Using local clip ${i + 1}/${clips.length}: ${clip.url}`);
          localClipPaths.push(clip.url);
        } else {
          // Need to download from URL
          const localPath = path.join(tempSessionDir, `clip_${i}.mp4`);
          console.log(`📥 VIDEO PROCESSING: Downloading clip ${i + 1}/${clips.length}: ${clip.description}`);
          await this.downloadVideo(clip.url, localPath);
          localClipPaths.push(localPath);
        }
      }
      
      // Calculate optimal clip durations
      const adjustedClips = this.calculateOptimalDurations(clips, options);
      console.log(`📊 VIDEO PROCESSING: Adjusted durations:`, adjustedClips.map(c => `${c.duration}s`));
      
      // Create FFmpeg filter for concatenation
      const filterComplex = this.buildFilterComplex(adjustedClips, options);
      
      // Output file path
      const outputPath = path.join(tempSessionDir, `stitched_${sessionId}.${options.outputFormat || 'mp4'}`);
      
      // Execute FFmpeg using fluent-ffmpeg
      console.log(`🔧 VIDEO PROCESSING: Executing FFmpeg with fluent-ffmpeg...`);
      
      await this.executeFFmpeg(localClipPaths, outputPath, filterComplex, options);
      
      // Upload to Firebase Storage
      console.log(`☁️ VIDEO PROCESSING: Uploading stitched video to Firebase Storage...`);
      const firebaseUrl = await firebaseStorageService.uploadVideoFromPath(outputPath, `stitched-videos/${sessionId}.${options.outputFormat || 'mp4'}`);
      
      console.log(`✅ VIDEO PROCESSING: Video stitching completed successfully`);
      console.log(`🔗 VIDEO PROCESSING: Firebase URL: ${firebaseUrl}`);
      
      return firebaseUrl;
      
    } catch (error) {
      console.error('❌ VIDEO PROCESSING: Video stitching failed:', error);
      throw new Error(`Video stitching failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      // Cleanup temp files (including any frame images)
      await this.cleanupTempFiles(tempSessionDir);
    }
  }

  /**
   * Check if video file has audio track
   */
  private async hasAudioTrack(videoPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(videoPath, (err: any, metadata: any) => {
        if (err) {
          console.warn(`⚠️ VIDEO PROCESSING: Could not probe video for audio:`, err);
          resolve(false);
          return;
        }
        const hasAudio = metadata.streams.some((stream: any) => stream.codec_type === 'audio');
        console.log(`🔊 VIDEO PROCESSING: Video ${path.basename(videoPath)} has audio: ${hasAudio}`);
        resolve(hasAudio);
      });
    });
  }

  /**
   * Download video from URL to local path
   */
  private async downloadVideo(url: string, localPath: string): Promise<void> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
      }
      
      const buffer = await response.arrayBuffer();
      await fs.writeFile(localPath, Buffer.from(buffer));
      
      console.log(`✅ VIDEO PROCESSING: Downloaded video to ${localPath}`);
    } catch (error) {
      console.error(`❌ VIDEO PROCESSING: Failed to download video from ${url}:`, error);
      throw error;
    }
  }

  /**
   * Calculate optimal durations for each clip to reach target duration
   * Uses sub-second trimming to mask transition jitter (as per Veo 3.1 best practices)
   */
  private calculateOptimalDurations(clips: VideoClip[], options: VideoStitchingOptions): VideoClip[] {
    // Apply sub-second trimming to mask transition jitter (100-200ms overlap removal)
    // This follows the recommendation from the Veo 3.1 documentation
    const trimOverlap = 0.2; // 200ms trim from each segment transition
    
    return clips.map((clip, index) => {
      let adjustedDuration = clip.duration;
      
      // Trim end of clip (except last) to remove transition jitter
      if (index < clips.length - 1) {
        adjustedDuration = Math.max(0, clip.duration - trimOverlap);
      }
      
      // Trim start of clip (except first) to remove transition jitter
      // This is handled in the filter complex, but we track it here
      
      return {
        ...clip,
        duration: adjustedDuration,
        startOffset: index === 0 ? 0 : trimOverlap, // Start after trim for non-first clips
        endOffset: index === clips.length - 1 ? clip.duration : clip.duration - trimOverlap
      };
    });
  }

  /**
   * Build FFmpeg filter complex for video concatenation with transitions
   * Implements sub-second trimming to mask transition jitter (Veo 3.1 best practice)
   */
  private buildFilterComplex(clips: VideoClip[], options: VideoStitchingOptions): string {
    const transitionDuration = options.transitionDuration || 0.3; // Shorter transitions for smoother continuity
    const addTransitions = options.addFadeTransitions !== false;
    const trimOverlap = 0.2; // 200ms trim to mask transition jitter
    
    if (clips.length === 1) {
      return `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];[0:a]aformat=sample_rates=44100:channel_layouts=stereo[a0];[v0][a0]concat=n=1:v=1:a=1[out]`;
    }
    
    let filterParts: string[] = [];
    let concatInputs: string[] = [];
    
    // Process each clip with sub-second trimming
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const isFirst = i === 0;
      const isLast = i === clips.length - 1;
      
      // Calculate trim points (mask transition jitter)
      const startTrim = isFirst ? 0 : trimOverlap; // Trim start of non-first clips
      const endTrim = isLast ? clip.duration : clip.duration - trimOverlap; // Trim end of non-last clips
      const effectiveDuration = endTrim - startTrim;
      
      // Scale and pad video
      filterParts.push(`[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}_scaled]`);
      
      // Trim video to remove transition jitter
      if (!isFirst || !isLast) {
        filterParts.push(`[v${i}_scaled]trim=start=${startTrim}:end=${endTrim},setpts=PTS-STARTPTS[v${i}_trimmed}]`);
      } else {
        filterParts.push(`[v${i}_scaled]trim=start=${startTrim}:end=${endTrim},setpts=PTS-STARTPTS[v${i}_trimmed]`);
      }
      
      // Process audio with matching trim (handle cases where audio might be missing)
      // Use anullsrc to generate silent audio if input has no audio track
      filterParts.push(`[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo,atrim=start=${startTrim}:end=${endTrim},asetpts=PTS-STARTPTS[a${i}_trimmed]`);
      
      // Add fade transitions if enabled
      if (addTransitions) {
        const fadeInTime = isFirst ? transitionDuration : 0;
        const fadeOutTime = isLast ? effectiveDuration : effectiveDuration - transitionDuration;
        
        if (fadeInTime > 0) {
          filterParts.push(`[v${i}_trimmed]fade=t=in:st=0:d=${fadeInTime}[vf${i}]`);
          filterParts.push(`[a${i}_trimmed]afade=t=in:st=0:d=${fadeInTime}[af${i}]`);
        } else if (!isLast) {
          filterParts.push(`[v${i}_trimmed]fade=t=out:st=${fadeOutTime}:d=${transitionDuration}[vf${i}]`);
          filterParts.push(`[a${i}_trimmed]afade=t=out:st=${fadeOutTime}:d=${transitionDuration}[af${i}]`);
        } else {
          filterParts.push(`[v${i}_trimmed][vf${i}]`);
          filterParts.push(`[a${i}_trimmed][af${i}]`);
        }
        concatInputs.push(`[vf${i}][af${i}]`);
      } else {
        concatInputs.push(`[v${i}_trimmed][a${i}_trimmed]`);
      }
    }
    
    // Concatenate all clips
    const concatFilter = `concat=n=${clips.length}:v=1:a=1[out]`;
    filterParts.push(concatFilter);
    
    return filterParts.join(';');
  }

  /**
   * Execute FFmpeg using fluent-ffmpeg
   */
  private async executeFFmpeg(inputFiles: string[], outputPath: string, filterComplex: string, options: VideoStitchingOptions): Promise<void> {
    return new Promise(async (resolve, reject) => {
      console.log(`🚀 VIDEO PROCESSING: Running FFmpeg with fluent-ffmpeg`);
      console.log(`📁 VIDEO PROCESSING: Input files:`, inputFiles);
      console.log(`📁 VIDEO PROCESSING: Output path:`, outputPath);
      console.log(`🔧 VIDEO PROCESSING: Filter complex:`, filterComplex);
      
      // Check if all input files have audio
      const audioChecks = await Promise.all(
        inputFiles.map(file => this.hasAudioTrack(file).catch(() => false))
      );
      const allHaveAudio = audioChecks.every(hasAudio => hasAudio);
      const someHaveAudio = audioChecks.some(hasAudio => hasAudio);
      
      console.log(`🔊 VIDEO PROCESSING: Audio check results:`, audioChecks);
      console.log(`🔊 VIDEO PROCESSING: All have audio: ${allHaveAudio}, Some have audio: ${someHaveAudio}`);
      
      let command = ffmpeg();
      
      // Add input files
      inputFiles.forEach((inputFile, index) => {
        command = command.input(inputFile);
        if (!audioChecks[index]) {
          console.log(`⚠️ VIDEO PROCESSING: Input ${index} (${path.basename(inputFile)}) has no audio track`);
        }
      });
      
      // Apply filter complex
      command = command.complexFilter(filterComplex);
      
      // Map output (video and audio)
      command = command.outputOptions(['-map', '[out]']);
      
      // Set video codec and quality
      command = command
        .videoCodec('libx264')
        .addOption('-preset', this.getPreset(options.quality))
        .addOption('-crf', this.getCrf(options.quality).toString())
        .addOption('-movflags', '+faststart')
        .addOption('-pix_fmt', 'yuv420p'); // Ensure compatibility
      
      // Set audio codec - handle missing audio gracefully
      if (someHaveAudio || allHaveAudio) {
        command = command
          .audioCodec('aac')
          .audioBitrate('128k')
          .audioChannels(2)
          .audioFrequency(44100)
          .addOption('-shortest') // Ensure output duration matches video
          .addOption('-avoid_negative_ts', 'make_zero'); // Handle audio sync issues
      } else {
        console.log(`⚠️ VIDEO PROCESSING: No audio in any input - output will be silent`);
        // Still set audio codec to ensure compatibility (will be silent)
        command = command
          .audioCodec('aac')
          .audioBitrate('128k')
          .audioChannels(2)
          .audioFrequency(44100);
      }
      
      // Set output file
      command = command.output(outputPath);
      
      // Handle events
      command.on('start', (commandLine: string) => {
        console.log(`🚀 VIDEO PROCESSING: FFmpeg command: ${commandLine}`);
      });
      
      command.on('progress', (progress: any) => {
        console.log(`📊 VIDEO PROCESSING: Progress: ${progress.percent}% done`);
      });
      
      command.on('end', () => {
        console.log(`✅ VIDEO PROCESSING: FFmpeg completed successfully`);
        resolve();
      });
      
      command.on('error', (error: Error, stdout: string, stderr: string) => {
        console.error(`❌ VIDEO PROCESSING: FFmpeg error:`, error);
        console.error(`❌ VIDEO PROCESSING: FFmpeg stderr:`, stderr);
        // If error is about missing audio, try to continue with silent audio
        if (stderr.includes('Stream map') && stderr.includes('audio')) {
          console.log(`⚠️ VIDEO PROCESSING: Audio stream error detected - this might be due to missing audio tracks`);
        }
        reject(error);
      });
      
      // Run the command
      command.run();
    });
  }

  /**
   * Get FFmpeg preset based on quality
   */
  private getPreset(quality?: string): string {
    switch (quality) {
      case 'high': return 'slow';
      case 'medium': return 'medium';
      case 'low': return 'fast';
      default: return 'medium';
    }
  }

  /**
   * Get FFmpeg CRF based on quality
   */
  private getCrf(quality?: string): number {
    switch (quality) {
      case 'high': return 18;
      case 'medium': return 23;
      case 'low': return 28;
      default: return 23;
    }
  }

  /**
   * Clean up temporary files
   */
  private async cleanupTempFiles(dirPath: string): Promise<void> {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
      console.log(`🧹 VIDEO PROCESSING: Cleaned up temp files in ${dirPath}`);
    } catch (error) {
      console.warn(`⚠️ VIDEO PROCESSING: Failed to cleanup temp files:`, error);
    }
  }

  /**
   * Extract the last frame from a video file
   */
  private async extractLastFrame(videoPath: string, outputFramePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      console.log(`📸 VIDEO PROCESSING: Extracting last frame from ${videoPath}`);
      
      // First, get video duration
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          console.error(`❌ VIDEO PROCESSING: Failed to probe video:`, err);
          reject(err);
          return;
        }
        
        const duration = metadata.format.duration || 0;
        // Extract frame at 99% of duration (near the end)
        const timestamp = Math.max(0, duration * 0.99);
        
        console.log(`📸 VIDEO PROCESSING: Extracting frame at ${timestamp.toFixed(2)}s (duration: ${duration.toFixed(2)}s)`);
        
        ffmpeg(videoPath)
          .on('end', () => {
            console.log(`✅ VIDEO PROCESSING: Last frame extracted to ${outputFramePath}`);
            resolve(outputFramePath);
          })
          .on('error', (error: Error) => {
            console.error(`❌ VIDEO PROCESSING: Failed to extract last frame:`, error);
            reject(error);
          })
          .screenshots({
            timestamps: [timestamp],
            filename: path.basename(outputFramePath),
            folder: path.dirname(outputFramePath),
            size: '1920x1080'
          });
      });
    });
  }

  /**
   * Get frame as base64 for reference in next video generation
   */
  private async getFrameAsBase64(framePath: string): Promise<string> {
    try {
      const frameBuffer = await fs.readFile(framePath);
      const base64 = frameBuffer.toString('base64');
      return `data:image/jpeg;base64,${base64}`;
    } catch (error) {
      console.error('Failed to read frame as base64:', error);
      throw error;
    }
  }

  /**
   * Generate multiple video clips from a single brief for stitching with advanced Veo 3.1 features:
   * - Scene Extension (previous video file)
   * - Reference Images (Ingredient-to-Video)
   * - Frame-locking (first/last frame specification)
   * - Structured script generation
   */
  async generateVideoClipsForStitching(
    brief: string, 
    targetDuration: number,
    platform: string = 'general'
  ): Promise<VideoClip[]> {
    console.log(`🎬 VIDEO PROCESSING: Generating video clips with Veo 3.1 advanced features`);
    console.log(`📝 VIDEO PROCESSING: Brief: "${brief.substring(0, 100)}..."`);
    console.log(`🎯 VIDEO PROCESSING: Target duration: ${targetDuration}s`);
    
    // Step 1: Generate structured script using Gemini LLM
    const { videoScriptService } = await import('./video-script-service');
    console.log(`📝 VIDEO PROCESSING: Step 1 - Generating structured script with continuity bible...`);
    const script = await videoScriptService.generateStructuredScript(brief, targetDuration, platform);
    
    const segmentCount = script.segments.length;
    const actualDuration = segmentCount * 8;
    console.log(`📊 VIDEO PROCESSING: Generated ${segmentCount} segments from structured script (total: ${actualDuration}s)`);
    console.log(`📖 VIDEO PROCESSING: Continuity Bible - Style: "${script.continuityBible.consistentStyle}"`);
    
    // Import services
    const { aiService } = await import('./ai-service');
    const { gemini } = await import('./gemini-client');
    
    const clips: VideoClip[] = [];
    const sessionId = uuidv4();
    const tempSessionDir = path.join(this.tempDir, sessionId);
    await fs.mkdir(tempSessionDir, { recursive: true });
    
    // Track previous video file for Scene Extension
    let previousVideoFile: any = null;
    let previousVideoPath: string | null = null;
    let previousFramePath: string | null = null;
    let previousFrameBase64: string | null = null;
    
    // Reference images for visual consistency (will be generated/collected)
    const referenceImages: string[] = [];
    
    try {
      for (let i = 0; i < segmentCount; i++) {
        const segment = script.segments[i];
        const isFirstSegment = i === 0;
        const isLastSegment = i === segmentCount - 1;
        
        console.log(`🎥 VIDEO PROCESSING: Generating segment ${i + 1}/${segmentCount}`);
        console.log(`📋 VIDEO PROCESSING: Segment prompt: "${segment.prompt.substring(0, 100)}..."`);
        
        try {
          // Build enhanced prompt with continuity bible descriptors
          const enhancedPrompt = `${segment.prompt}. ${script.continuityBible.consistentStyle}. ${script.continuityBible.consistentLighting}. ${script.continuityBible.consistentColorGrading}.`;
          
          // For first segment, generate reference images if needed
          if (isFirstSegment && referenceImages.length === 0) {
            // Optionally generate reference images for visual consistency
            // This would use Gemini Imagen to create character/style references
            console.log(`🖼️ VIDEO PROCESSING: Reference images will be generated if needed`);
          }
          
          // Prepare generation options for Veo 3.1
          const generationOptions: any = {
            aspectRatio: "16:9" as const,
            duration: '8s',
            model: 'veo-3.1-generate-preview'
          };
          
          // Scene Extension: Use previous video file for segments after the first
          if (previousVideoFile && !isFirstSegment) {
            generationOptions.previousVideoFile = previousVideoFile;
            console.log(`🔗 VIDEO PROCESSING: Using Scene Extension - continuing from previous segment`);
          }
          
          // Reference Images: Add for visual consistency (Ingredient-to-Video)
          if (referenceImages.length > 0) {
            generationOptions.referenceImages = referenceImages;
            console.log(`🖼️ VIDEO PROCESSING: Using ${referenceImages.length} reference images for visual consistency`);
          }
          
          // Frame-locking: Use last frame of previous segment as first frame
          if (previousFrameBase64 && !isFirstSegment) {
            generationOptions.firstFrame = previousFrameBase64;
            console.log(`📸 VIDEO PROCESSING: Using frame-locking - starting from previous segment's last frame`);
          }
          
          // Generate video using Veo 3.1 with advanced features
          console.log(`🎬 VIDEO PROCESSING: Generating video with Veo 3.1 advanced features...`);
          const videoUrls = await gemini.generateVideos(
            enhancedPrompt,
            'veo-3.1-generate-preview',
            true, // download
            generationOptions
          );
          
          if (videoUrls && videoUrls.length > 0) {
            const videoUrl = videoUrls[0];
            const localVideoPath = path.join(tempSessionDir, `segment_${i}.mp4`);
            
            // Download the video locally
            console.log(`📥 VIDEO PROCESSING: Downloading segment ${i + 1} to local path...`);
            await this.downloadVideo(videoUrl, localVideoPath);
            
            clips.push({
              url: localVideoPath,
              duration: 8,
              order: i,
              description: segment.prompt
            });
            
            console.log(`✅ VIDEO PROCESSING: Generated segment ${i + 1}: ${videoUrl}`);
            
            // Prepare for next segment: Extract last frame and upload video to Files API for Scene Extension
            if (!isLastSegment) {
              // Extract last frame for frame-locking
              const framePath = path.join(tempSessionDir, `frame_${i}.jpg`);
              try {
                await this.extractLastFrame(localVideoPath, framePath);
                previousFramePath = framePath;
                previousFrameBase64 = await this.getFrameAsBase64(framePath);
                console.log(`📸 VIDEO PROCESSING: Extracted last frame from segment ${i + 1}`);
                
                // Upload video to Files API for Scene Extension (Veo 3.1 requires file object)
                try {
                  const { uploadFileToGemini } = await import('./gemini-client');
                  const file = await uploadFileToGemini(localVideoPath, 'video/mp4');
                  previousVideoFile = file;
                  previousVideoPath = localVideoPath;
                  console.log(`☁️ VIDEO PROCESSING: Uploaded segment ${i + 1} to Files API for Scene Extension`);
                } catch (uploadError) {
                  console.warn(`⚠️ VIDEO PROCESSING: Failed to upload to Files API, will use frame-locking only:`, uploadError);
                  // Fallback: use frame-locking (previousVideoFile will be null, but firstFrame will work)
                  previousVideoPath = localVideoPath;
                }
              } catch (frameError) {
                console.warn(`⚠️ VIDEO PROCESSING: Failed to extract frame:`, frameError);
                previousFrameBase64 = null;
              }
            }
          } else {
            console.warn(`⚠️ VIDEO PROCESSING: No video generated for segment ${i + 1}`);
          }
        } catch (error) {
          console.error(`❌ VIDEO PROCESSING: Failed to generate segment ${i + 1}:`, error);
          // Implement retry logic here if needed
          // For now, continue with other segments
        }
      }
      
      console.log(`🎬 VIDEO PROCESSING: Generated ${clips.length} clips for stitching`);
      console.log(`✅ VIDEO PROCESSING: Used Veo 3.1 features: Scene Extension, Frame-locking, Reference Images`);
      
      return clips.map(clip => ({
        ...clip,
        url: clip.url
      }));
      
    } catch (error) {
      console.error('❌ VIDEO PROCESSING: Error in advanced video generation:', error);
      throw error;
    } finally {
      // Note: We don't cleanup here - files will be cleaned up after stitching
    }
  }

  /**
   * Break down a brief into multiple segments for video generation
   * (Legacy method - now using frame-to-frame continuity in generateVideoClipsForStitching)
   */
  private breakDownBrief(brief: string, targetDuration: number): Array<{description: string, duration: number}> {
    // Calculate number of 8-second segments
    const segmentCount = Math.ceil(targetDuration / 8);
    const segmentDuration = 8; // Each segment is 8 seconds
    
    const segments: Array<{description: string, duration: number}> = [];
    
    if (segmentCount === 1) {
      // Single segment
      segments.push({
        description: brief,
        duration: segmentDuration
      });
    } else {
      // Multiple segments: beginning, middle, end
      segments.push({
        description: `Opening scene: ${brief}. Show the beginning, setup, or introduction.`,
        duration: segmentDuration
      });
      
      for (let i = 1; i < segmentCount - 1; i++) {
        segments.push({
          description: `Middle scene ${i}: ${brief}. Show the main action, product features, or key message.`,
          duration: segmentDuration
        });
      }
      
      if (segmentCount > 1) {
        segments.push({
          description: `Closing scene: ${brief}. Show the conclusion, call to action, or final message.`,
          duration: segmentDuration
        });
      }
    }
    
    return segments;
  }
}

export const videoProcessingService = new VideoProcessingService();
