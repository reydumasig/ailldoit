// Domain utilities for Firebase Auth debugging
export const getCurrentDomain = () => {
  return window.location.hostname;
};

export const getCurrentUrl = () => {
  return window.location.href;
};

export const getRequiredDomains = () => {
  const currentDomain = getCurrentDomain();
  
  return [
    'localhost',
    '127.0.0.1',
    currentDomain,
    // Common variations
    currentDomain.replace('http://', '').replace('https://', ''),
  ].filter((domain, index, arr) => arr.indexOf(domain) === index); // Remove duplicates
};

export const getDomainInstructions = () => {
  const domains = getRequiredDomains();
  
  return `
Firebase Console Setup Required:

1. Go to https://console.firebase.google.com/
2. Select your project
3. Navigate to Authentication > Settings
4. Click "Authorized domains" tab
5. Add these domains:
${domains.map(domain => `   • ${domain}`).join('\n')}
6. Click "Add domain" for each one
7. Save changes

Current domain: ${getCurrentDomain()}
Current URL: ${getCurrentUrl()}
  `.trim();
};