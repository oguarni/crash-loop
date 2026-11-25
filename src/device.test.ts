import { describe, it, expect, afterEach } from 'vitest';
import { currentDevice, readDevice } from './device';

// Real user agents, as each browser sends them. The cases that matter most are
// the in-app ones: a link tapped in Instagram must be recognised as Instagram's
// browser on both platforms, because the fullscreen guide starts by getting the
// player out of it.
const UA = {
  iosSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  iosInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Instagram 356.0.0.41.101 (iPhone15,3; iOS 18_1; en_US; en; scale=3.00; 1290x2796; 653063484; IABMV/1)',
  iosFacebook:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.37.106;FBDV/iPhone14,7;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]',
  iosMessenger:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/466.0.0.41.109;FBDV/iPhone14,7;FBMD/iPhone;FBSN/iOS;FBSV/17.5]',
  iosWebView:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  iosChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  ipadDesktopSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  androidInstagram:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240705.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.134 Mobile Safari/537.36 Instagram 339.0.0.33.98 Android (34/14; 420dpi; 1080x2400; Google/google; Pixel 8; shiba; shiba; en_US; 620130591)',
  androidTikTok:
    'Mozilla/5.0 (Linux; Android 13; SM-S911B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36 trill_2023504050 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/35.4.5 ByteLocale/en',
  androidWebView:
    'Mozilla/5.0 (Linux; Android 13; SM-S911B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36',
  desktopChrome:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

describe('reading the device from its user agent', () => {
  it('recognises Instagram’s browser on both platforms', () => {
    expect(readDevice(UA.iosInstagram, 5)).toEqual({ os: 'ios', inApp: 'Instagram', safari: false });
    expect(readDevice(UA.androidInstagram, 5)).toEqual({ os: 'android', inApp: 'Instagram', safari: false });
  });

  it('tells Messenger from Facebook, though both carry FBAN', () => {
    expect(readDevice(UA.iosFacebook, 5).inApp).toBe('Facebook');
    expect(readDevice(UA.iosMessenger, 5).inApp).toBe('Messenger');
  });

  it('names TikTok by its app token', () => {
    expect(readDevice(UA.androidTikTok, 5).inApp).toBe('TikTok');
  });

  it('still catches an embedded browser that does not name its app', () => {
    // iOS: a WKWebView keeps no Safari/ token. Android: the system WebView adds "; wv)".
    expect(readDevice(UA.iosWebView, 5).inApp).toBe('app');
    expect(readDevice(UA.androidWebView, 5).inApp).toBe('app');
  });

  it('knows Safari from the other iPhone browsers', () => {
    expect(readDevice(UA.iosSafari, 5)).toEqual({ os: 'ios', inApp: null, safari: true });
    expect(readDevice(UA.iosChrome, 5)).toEqual({ os: 'ios', inApp: null, safari: false });
  });

  it('finds an iPad behind the desktop user agent its Safari sends', () => {
    expect(readDevice(UA.ipadDesktopSafari, 5)).toEqual({ os: 'ios', inApp: null, safari: true });
    // the same string with no touch points is a Mac
    expect(readDevice(UA.ipadDesktopSafari, 0).os).toBe('other');
  });

  it('takes Chrome on Android for a real browser', () => {
    expect(readDevice(UA.androidChrome, 5)).toEqual({ os: 'android', inApp: null, safari: false });
  });

  it('describes nothing in-app off a phone', () => {
    expect(readDevice(UA.desktopChrome, 0)).toEqual({ os: 'other', inApp: null, safari: false });
    expect(readDevice('', 0)).toEqual({ os: 'other', inApp: null, safari: false });
  });
});

describe('reading the live device', () => {
  const scope = globalThis as { navigator?: unknown };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete scope.navigator;
  });

  it('reads navigator when there is one', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: UA.iosInstagram, maxTouchPoints: 5 },
      configurable: true,
    });
    expect(currentDevice().inApp).toBe('Instagram');
  });

  it('answers "other" with no navigator, or a strange one', () => {
    Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true });
    expect(currentDevice().os).toBe('other');
    Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 42 }, configurable: true });
    expect(currentDevice().os).toBe('other');
  });
});
