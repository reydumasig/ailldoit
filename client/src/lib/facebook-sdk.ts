// Facebook SDK TypeScript declarations and utilities

declare global {
  interface Window {
    FB: {
      init(params: {
        appId: string;
        cookie?: boolean;
        xfbml?: boolean;
        version: string;
      }): void;
      
      AppEvents: {
        logPageView(): void;
      };
      
      login(callback: (response: FacebookLoginResponse) => void, options?: {
        scope?: string;
        return_scopes?: boolean;
        enable_profile_selector?: boolean;
      }): void;
      
      logout(callback?: (response: any) => void): void;
      
      getLoginStatus(callback: (response: FacebookLoginResponse) => void): void;
      
      api(path: string, method: string, params: any, callback: (response: any) => void): void;
      api(path: string, params: any, callback: (response: any) => void): void;
      api(path: string, callback: (response: any) => void): void;
      
      XFBML: {
        parse(element?: Element): void;
      };
    };
    
    fbAsyncInit: () => void;
    checkLoginState?: () => void;
    statusChangeCallback?: (response: FacebookLoginResponse) => void;
  }
}

export interface FacebookLoginResponse {
  status: 'connected' | 'not_authorized' | 'unknown';
  authResponse?: {
    accessToken: string;
    expiresIn: number;
    signedRequest: string;
    userID: string;
  };
}

export interface FacebookUser {
  id: string;
  name: string;
  email?: string;
  picture?: {
    data: {
      url: string;
    };
  };
}

export interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  category: string;
  tasks: string[];
}

export class FacebookSDK {
  private isInitialized = false;
  private sdkLoaded = false;
  
  constructor() {
    this.loadSDK();
  }
  
  private loadSDK(): void {
    if (this.sdkLoaded) return;
    
    // Set up fbAsyncInit callback
    window.fbAsyncInit = () => {
      window.FB.init({
        appId: import.meta.env.VITE_META_APP_ID || '',
        cookie: true,
        xfbml: true,
        version: 'v19.0',
        // Add client token for enhanced security (if available)
        ...(import.meta.env.VITE_META_CLIENT_TOKEN ? { 
          clientToken: import.meta.env.VITE_META_CLIENT_TOKEN 
        } : {})
      });
      
      window.FB.AppEvents.logPageView();
      this.isInitialized = true;
      
      // Set up global callback functions for Facebook Login Button
      window.checkLoginState = () => {
        window.FB.getLoginStatus((response) => {
          if (window.statusChangeCallback) {
            window.statusChangeCallback(response);
          }
        });
      };
      
      // Parse existing XFBML elements
      window.FB.XFBML.parse();
    };
    
    // Load Facebook SDK script
    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    
    const firstScript = document.getElementsByTagName('script')[0];
    if (firstScript && firstScript.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
    }
    
    this.sdkLoaded = true;
  }
  
  private async waitForInitialization(): Promise<void> {
    return this.waitForSDK();
  }
  
  async login(permissions = 'email,public_profile,pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish'): Promise<FacebookLoginResponse> {
    await this.waitForInitialization();
    
    return new Promise((resolve) => {
      window.FB.login((response) => {
        resolve(response);
      }, {
        scope: permissions,
        return_scopes: true
      });
    });
  }
  
  async logout(): Promise<void> {
    await this.waitForInitialization();
    
    return new Promise((resolve) => {
      window.FB.logout(() => {
        resolve();
      });
    });
  }
  
  async getLoginStatus(): Promise<FacebookLoginResponse> {
    await this.waitForInitialization();
    
    return new Promise((resolve) => {
      window.FB.getLoginStatus((response) => {
        resolve(response);
      });
    });
  }
  
  async getCurrentUser(): Promise<FacebookUser | null> {
    await this.waitForInitialization();
    
    const loginStatus = await this.getLoginStatus();
    if (loginStatus.status !== 'connected') {
      return null;
    }
    
    return new Promise((resolve) => {
      window.FB.api('/me', { fields: 'id,name,email,picture' }, (response) => {
        if (response && !response.error) {
          resolve(response as FacebookUser);
        } else {
          resolve(null);
        }
      });
    });
  }
  
  // Set up status change callback for Facebook Login Button
  setStatusChangeCallback(callback: (response: FacebookLoginResponse) => void): void {
    window.statusChangeCallback = callback;
  }
  
  // Parse XFBML elements after dynamic content changes
  parseXFBML(element?: Element): void {
    if (window.FB && window.FB.XFBML) {
      window.FB.XFBML.parse(element);
    }
  }
  
  // Expose waitForSDK as public method
  async waitForSDK(): Promise<void> {
    return new Promise((resolve) => {
      if (window.FB && this.isInitialized) {
        resolve();
        return;
      }
      
      const checkSDK = () => {
        if (window.FB && this.isInitialized) {
          resolve();
        } else {
          setTimeout(checkSDK, 100);
        }
      };
      
      checkSDK();
    });
  }
  
  async getUserPages(): Promise<FacebookPage[]> {
    await this.waitForInitialization();
    
    const loginStatus = await this.getLoginStatus();
    if (loginStatus.status !== 'connected') {
      return [];
    }
    
    return new Promise((resolve) => {
      window.FB.api('/me/accounts', { fields: 'id,name,access_token,category,tasks' }, (response) => {
        if (response && response.data && !response.error) {
          resolve(response.data as FacebookPage[]);
        } else {
          resolve([]);
        }
      });
    });
  }
  
  async publishToPage(pageId: string, pageAccessToken: string, content: {
    message?: string;
    link?: string;
    picture?: string;
    name?: string;
    caption?: string;
    description?: string;
  }): Promise<{ id: string } | null> {
    await this.waitForInitialization();
    
    return new Promise((resolve) => {
      window.FB.api(`/${pageId}/feed`, 'POST', {
        ...content,
        access_token: pageAccessToken
      }, (response) => {
        if (response && response.id) {
          resolve({ id: response.id });
        } else {
          console.error('Facebook publish error:', response);
          resolve(null);
        }
      });
    });
  }
  
  async uploadPhoto(pageId: string, pageAccessToken: string, photoBlob: Blob, caption?: string): Promise<{ id: string } | null> {
    await this.waitForInitialization();
    
    const formData = new FormData();
    formData.append('source', photoBlob);
    if (caption) formData.append('caption', caption);
    formData.append('access_token', pageAccessToken);
    
    try {
      const response = await fetch(`https://graph.facebook.com/v19.0/${pageId}/photos`, {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.id) {
        return { id: result.id };
      } else {
        console.error('Facebook photo upload error:', result);
        return null;
      }
    } catch (error) {
      console.error('Facebook photo upload failed:', error);
      return null;
    }
  }
  
  async getPageInsights(pageId: string, pageAccessToken: string, metrics = 'page_impressions,page_engaged_users'): Promise<any> {
    await this.waitForInitialization();
    
    return new Promise((resolve) => {
      window.FB.api(`/${pageId}/insights`, {
        metric: metrics,
        access_token: pageAccessToken,
        period: 'day',
        since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Last 7 days
        until: new Date().toISOString().split('T')[0]
      }, (response) => {
        resolve(response);
      });
    });
  }
}

export const facebookSDK = new FacebookSDK();