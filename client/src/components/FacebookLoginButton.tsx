import { useEffect, useRef } from 'react';
import { facebookSDK, type FacebookLoginResponse } from '@/lib/facebook-sdk';

interface FacebookLoginButtonProps {
  onLogin?: (response: FacebookLoginResponse) => void;
  onLogout?: () => void;
  scope?: string;
  className?: string;
  size?: 'small' | 'medium' | 'large';
  buttonType?: 'continue_with' | 'login_with';
  autoLogoutLink?: boolean;
  width?: string;
}

export default function FacebookLoginButton({
  onLogin,
  onLogout,
  scope = 'public_profile,email,pages_manage_posts,pages_read_engagement',
  className = '',
  size = 'medium',
  buttonType = 'continue_with',
  autoLogoutLink = true,
  width = '100%'
}: FacebookLoginButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Set up the status change callback
    if (onLogin) {
      facebookSDK.setStatusChangeCallback((response: FacebookLoginResponse) => {
        if (response.status === 'connected') {
          onLogin(response);
        } else if (response.status === 'not_authorized' || response.status === 'unknown') {
          if (onLogout) {
            onLogout();
          }
        }
      });
    }

    // Parse XFBML after component mounts
    const parseXFBML = async () => {
      await facebookSDK.waitForSDK();
      if (containerRef.current) {
        facebookSDK.parseXFBML(containerRef.current);
      }
    };

    parseXFBML();
  }, [onLogin, onLogout]);

  return (
    <div ref={containerRef} className={className}>
      <div
        className="fb-login-button"
        data-width={width}
        data-size={size}
        data-button-type={buttonType}
        data-layout="default"
        data-auto-logout-link={autoLogoutLink.toString()}
        data-use-continue-as="false"
        data-scope={scope}
        data-onlogin="checkLoginState();"
      />
    </div>
  );
}