import type { GeneratedContent } from "@shared/schema";

export function generateContent(brief: string, platform: string, language: string): GeneratedContent {
  const contentMap: Record<string, Record<string, Partial<GeneratedContent>>> = {
    tiktok: {
      tagalog: {
        hook: "Teens sa Manila, sobrang obsessed sa mango-scented soap na 'to! 🥭✨",
        caption: "Teens sa Manila, sobrang obsessed sa mango-scented soap na 'to! 🥭✨\n\nHindi mo pa nasubukan? You're missing out! Yung amoy parang fresh mango tapos super gentle sa skin. Perfect para sa mga teen na gusto mag-glow up! 💫\n\nAvailable na sa lahat ng major stores! Grab mo na before maubos! 🛍️",
        hashtags: ["#MangoSoap", "#TeenSkincare", "#Manila", "#FreshScent", "#GlowUp"],
        videoScript: [
          { timeframe: "0-3s", action: "Close-up of teen unwrapping mango soap" },
          { timeframe: "3-7s", action: "Soap creates rich lather with mango scent visual effects" },
          { timeframe: "7-12s", action: "Teen's satisfied reaction, glowing skin effect" },
          { timeframe: "12-15s", action: "Product shot with call-to-action overlay" }
        ]
      },
      indonesian: {
        hook: "Anak muda Jakarta lagi obsessed sama sabun kopi artisan ini! ☕✨",
        caption: "Anak muda Jakarta lagi obsessed sama sabun kopi artisan ini! ☕✨\n\nBelum pernah coba? Rugi banget! Aromanya kayak kopi segar pagi, bikin mood naik terus kulit jadi halus. Perfect buat yang suka skincare natural! 🌿\n\nCuma ada di coffee shop favorit kalian! Buruan sebelum habis! ☕",
        hashtags: ["#KopiArtisan", "#SkincareCoffee", "#Jakarta", "#Natural", "#YouthSkincare"],
        videoScript: [
          { timeframe: "0-3s", action: "Coffee shop ambiance with soap display" },
          { timeframe: "3-7s", action: "Soap lathering with coffee bean visuals" },
          { timeframe: "7-12s", action: "Customer's refreshed look after use" },
          { timeframe: "12-15s", action: "Coffee shop location with product lineup" }
        ]
      }
    },
    instagram: {
      indonesian: {
        hook: "Professional muda Jakarta, ini rahasia kulit glowing kalian! ✨",
        caption: "Professional muda Jakarta, ini rahasia kulit glowing kalian! ✨\n\nSabun kopi artisan yang bikin kulit halus dan segar. Perfect buat yang busy tapi tetap mau glowing! Aromanya bikin rileks setelah kerja seharian 😌\n\nDapatkan di coffee shop terdekat! Limited edition lho! ☕",
        hashtags: ["#KopiArtisan", "#ProfessionalSkincare", "#Jakarta", "#GlowingSkin", "#ArtisanSoap"],
        videoScript: [
          { timeframe: "0-3s", action: "Professional getting ready for work" },
          { timeframe: "3-7s", action: "Using coffee soap in morning routine" },
          { timeframe: "7-12s", action: "Glowing skin reveal" },
          { timeframe: "12-15s", action: "Coffee shop product showcase" }
        ]
      }
    },
    facebook: {
      thai: {
        hook: "Gen Z Thailand กำลังหันมาใส่ใจแฟชั่น sustainable! 🌱✨",
        caption: "Gen Z Thailand กำลังหันมาใส่ใจแฟชั่น sustainable! 🌱✨\n\nเสื้อผ้าจากวัสดุรีไซเคิล ที่ไม่เพียงแต่สวย แต่ยังช่วยโลก! 🌍 Perfect สำหรับคนรุ่นใหม่ที่อยากแต่งตัวให้เท่ และรักษาสิ่งแวดล้อมไปในตัว",
        hashtags: ["#SustainableFashion", "#GenZThailand", "#EcoFriendly", "#RecycledFashion"],
        videoScript: [
          { timeframe: "0-3s", action: "Gen Z trying on sustainable fashion" },
          { timeframe: "3-7s", action: "Showing recycled material transformation" },
          { timeframe: "7-12s", action: "Fashion photoshoot with eco message" },
          { timeframe: "12-15s", action: "Brand showcase with sustainability stats" }
        ]
      }
    }
  };

  const content = contentMap[platform]?.[language] || contentMap.tiktok.tagalog;
  
  return {
    hook: content.hook || "Generate compelling hook for your product!",
    caption: content.caption || "Full engaging caption with call-to-action...",
    hashtags: content.hashtags || ["#YourBrand", "#SocialMedia", "#Marketing"],
    videoScript: content.videoScript || [
      { timeframe: "0-3s", action: "Product introduction" },
      { timeframe: "3-7s", action: "Feature demonstration" },
      { timeframe: "7-12s", action: "Customer reaction" },
      { timeframe: "12-15s", action: "Call-to-action" }
    ]
  };
}

export function generatePerformancePrediction() {
  return {
    estimatedReach: "85K - 120K",
    engagementRate: "4.2% - 6.8%",
    expectedCTR: "2.1% - 3.5%",
    viralPotential: "High"
  };
}
