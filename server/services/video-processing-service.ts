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
      
      // Download all video clips
      const localClipPaths: string[] = [];
      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        const localPath = path.join(tempSessionDir, `clip_${i}.mp4`);
        
        console.log(`📥 VIDEO PROCESSING: Downloading clip ${i + 1}/${clips.length}: ${clip.description}`);
        await this.downloadVideo(clip.url, localPath);
        localClipPaths.push(localPath);
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
      // Cleanup temp files
      await this.cleanupTempFiles(tempSessionDir);
    }
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
   */
  private calculateOptimalDurations(clips: VideoClip[], options: VideoStitchingOptions): VideoClip[] {
    const totalTransitionTime = (clips.length - 1) * (options.transitionDuration || 0.5);
    const availableTime = options.targetDuration - totalTransitionTime;
    
    // Distribute time evenly among clips
    const timePerClip = availableTime / clips.length;
    
    return clips.map(clip => ({
      ...clip,
      duration: Math.min(clip.duration, timePerClip) // Don't exceed original duration
    }));
  }

  /**
   * Build FFmpeg filter complex for video concatenation with transitions
   */
  private buildFilterComplex(clips: VideoClip[], options: VideoStitchingOptions): string {
    const transitionDuration = options.transitionDuration || 0.5;
    const addTransitions = options.addFadeTransitions !== false;
    
    if (clips.length === 1) {
      return `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];[0:a]aformat=sample_rates=44100:channel_layouts=stereo[a0];[v0][a0]concat=n=1:v=1:a=1[out]`;
    }
    
    let filterParts: string[] = [];
    let concatInputs: string[] = [];
    
    // Process each clip
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const duration = clip.duration;
      
      // Scale and pad video
      filterParts.push(`[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`);
      
      // Process audio
      filterParts.push(`[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo[a${i}]`);
      
      // Add fade transitions if enabled and not the last clip
      if (addTransitions && i < clips.length - 1) {
        const fadeOutTime = duration - transitionDuration;
        filterParts.push(`[v${i}]fade=t=out:st=${fadeOutTime}:d=${transitionDuration}[vf${i}]`);
        filterParts.push(`[a${i}]afade=t=out:st=${fadeOutTime}:d=${transitionDuration}[af${i}]`);
        concatInputs.push(`[vf${i}][af${i}]`);
      } else {
        concatInputs.push(`[v${i}][a${i}]`);
      }
    }
    
    // Add fade in to first clip if transitions are enabled
    if (addTransitions && clips.length > 1) {
      filterParts.push(`[v0]fade=t=in:st=0:d=${transitionDuration}[vf0]`);
      filterParts.push(`[a0]afade=t=in:st=0:d=${transitionDuration}[af0]`);
      concatInputs[0] = `[vf0][af0]`;
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
    return new Promise((resolve, reject) => {
      console.log(`🚀 VIDEO PROCESSING: Running FFmpeg with fluent-ffmpeg`);
      console.log(`📁 VIDEO PROCESSING: Input files:`, inputFiles);
      console.log(`📁 VIDEO PROCESSING: Output path:`, outputPath);
      console.log(`🔧 VIDEO PROCESSING: Filter complex:`, filterComplex);
      
      let command = ffmpeg();
      
      // Add input files
      inputFiles.forEach(inputFile => {
        command = command.input(inputFile);
      });
      
      // Apply filter complex
      command = command.complexFilter(filterComplex);
      
      // Map output
      command = command.outputOptions(['-map', '[out]']);
      
      // Set video codec and quality
      command = command
        .videoCodec('libx264')
        .addOption('-preset', this.getPreset(options.quality))
        .addOption('-crf', this.getCrf(options.quality).toString())
        .addOption('-movflags', '+faststart');
      
      // Set audio codec
      command = command
        .audioCodec('aac')
        .audioBitrate('128k');
      
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
      
      command.on('error', (error: Error) => {
        console.error(`❌ VIDEO PROCESSING: FFmpeg error:`, error);
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
   * Generate multiple video clips from a single brief for stitching
   */
  async generateVideoClipsForStitching(
    brief: string, 
    targetDuration: number,
    platform: string = 'general'
  ): Promise<VideoClip[]> {
    console.log(`🎬 VIDEO PROCESSING: Generating video clips for stitching`);
    console.log(`📝 VIDEO PROCESSING: Brief: "${brief.substring(0, 100)}..."`);
    console.log(`🎯 VIDEO PROCESSING: Target duration: ${targetDuration}s`);
    
    // Break down the brief into segments
    const segments = this.breakDownBrief(brief, targetDuration);
    console.log(`📊 VIDEO PROCESSING: Generated ${segments.length} segments:`, segments.map(s => s.description));
    
    // Import AI service
    const { aiService } = await import('./ai-service');
    
    const clips: VideoClip[] = [];
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      console.log(`🎥 VIDEO PROCESSING: Generating clip ${i + 1}/${segments.length}: ${segment.description}`);
      
      try {
        // Generate video for this segment
        const videoUrls = await aiService.generateAdVideos(
          segment.description,
          'modern advertising'
        );
        
        if (videoUrls && videoUrls.length > 0) {
          clips.push({
            url: videoUrls[0], // Use first video
            duration: segment.duration,
            order: i,
            description: segment.description
          });
          
          console.log(`✅ VIDEO PROCESSING: Generated clip ${i + 1}: ${videoUrls[0]}`);
        } else {
          console.warn(`⚠️ VIDEO PROCESSING: No video generated for segment ${i + 1}`);
        }
      } catch (error) {
        console.error(`❌ VIDEO PROCESSING: Failed to generate clip ${i + 1}:`, error);
        // Continue with other clips
      }
    }
    
    console.log(`🎬 VIDEO PROCESSING: Generated ${clips.length} clips for stitching`);
    return clips;
  }

  /**
   * Break down a brief into multiple segments for video generation
   */
  private breakDownBrief(brief: string, targetDuration: number): Array<{description: string, duration: number}> {
    // Simple heuristic: break into 2-3 segments of 6-8 seconds each
    const segmentCount = Math.ceil(targetDuration / 7); // 7 seconds per segment
    const segmentDuration = targetDuration / segmentCount;
    
    const segments: Array<{description: string, duration: number}> = [];
    
    if (segmentCount === 1) {
      // Single segment
      segments.push({
        description: brief,
        duration: targetDuration
      });
    } else if (segmentCount === 2) {
      // Two segments: opening and closing
      segments.push({
        description: `Opening scene: ${brief}. Show the beginning, setup, or introduction.`,
        duration: segmentDuration
      });
      segments.push({
        description: `Closing scene: ${brief}. Show the conclusion, call to action, or final message.`,
        duration: segmentDuration
      });
    } else {
      // Three or more segments: beginning, middle, end
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
      
      segments.push({
        description: `Closing scene: ${brief}. Show the conclusion, call to action, or final message.`,
        duration: segmentDuration
      });
    }
    
    return segments;
  }
}

export const videoProcessingService = new VideoProcessingService();
