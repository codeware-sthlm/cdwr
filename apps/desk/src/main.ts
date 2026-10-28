import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/500.css';
import '@fontsource/hanken-grotesk/600.css';
import '@fontsource/hanken-grotesk/700.css';
import { openUrl } from '@tauri-apps/plugin-opener';

import './fonts.css';
import './desk.css';
import './desk.js';

// Links open in the system browser, not in the webview
document.addEventListener('click', (event) => {
  const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
    'a[href^="http"]'
  );
  if (!link) return;
  event.preventDefault();
  void openUrl(link.href);
});

// step 5: start(adapter)
