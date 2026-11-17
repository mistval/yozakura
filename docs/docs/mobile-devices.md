---
title: Mobile Devices
sidebar_position: 4
description: Run Yozakura on Android with Termux or host it on your computer and access it securely from mobile via ngrok with Google OAuth or Tailscale.
keywords:
  - yozakura mobile
  - yozakura android
  - termux
  - ngrok google oauth
  - tailscale
---

Yozakura works on mobile browsers and automatically selects the mobile layout during first-time setup on narrow screens (you can also switch between Mobile and Desktop layouts anytime under **Chat Settings → Layout**).

There are two main ways to run Yozakura on mobile:

1. **[Directly on Android with Termux](#android-via-termux)**: Everything runs locally on your phone. Best if you use cloud LLM providers (like OpenRouter) and don't want to leave a computer running.
2. **[Hosted on a Computer](#hosted-on-a-computer)**: Run Yozakura on your PC/Mac/Linux machine and connect from your phone. Best if you run local models on your computer, want to share scenarios and saves between desktop and mobile, or prefer not to set up Termux.

---

## Android via Termux

Termux lets you run Yozakura directly on Android without a separate computer.

### 1. Install Termux

:::warning Do not install Termux from Google Play
The Google Play Store version of Termux is outdated and unmaintained, which causes package installation failures. Download Termux from **[F-Droid](https://f-droid.org/packages/com.termux/)** or the **[Termux GitHub Releases](https://github.com/termux/termux-app/releases)** page instead.
:::

### 2. Install dependencies, clone, and start Yozakura

Open Termux and paste the following commands:

```bash
pkg update
pkg upgrade -y
pkg install -y git nodejs-lts python3 make clang binutils sqlite
git clone -b mistval_dev https://github.com/mistval/yozakura.git

cat <<'EOF' > start_yozakura.sh
#!/bin/bash

set -e
set -x

cd yozakura
git pull
npm remove electron @electron-forge/cli @electron-forge/maker-zip @electron-forge/plugin-auto-unpack-natives
npm install
GYP_DEFINES="android_ndk_path=''" npm --prefix server install
npm run install:all
npm run build:web
PORT=4396 npm run start --prefix server
EOF

chmod +x start_yozakura.sh
./start_yozakura.sh
```

After running this, Termux will work for a short time (usually under a minute) and then pause with `~ $ ./start_yozakura.sh` at the bottom. **Press Enter** to continue. It will keep building and installing for roughly 5 minutes.

When you see `Server listening on port 4396`, Yozakura is ready. Open your phone's browser and go to:

```text
http://localhost:4396
```

You should see the Yozakura welcome screen (on mobile, it defaults to the Mobile layout and pre-fills OpenRouter defaults for convenience).

### 3. Starting Yozakura later & keeping it alive

- **Next time you launch**: Open Termux and run `./start_yozakura.sh`.
- **Keep Termux from being killed in the background**: Android aggressively suspends background apps. Disable battery optimization for Termux in Android Settings and tap **Acquire wake lock** in Termux's notification shade while running chats.
- **App-like shortcut**: In Chrome on Android, open the menu (`⋮`) and tap **Add to Home screen** while on `http://localhost:4396`.

---

## Hosted on a Computer

If you run local LLMs/image models on your computer, want shared data between PC and mobile, or want to avoid Termux setup, run Yozakura on your computer and connect from your phone's browser.

### 1. Run Yozakura (Docker or Git clone)

Follow the [Getting Started](getting-started.md) guide and choose **either [Docker](getting-started.md#docker) or [Git clone](getting-started.md#git-clone)**—do **not** use the Electron app, since the Electron desktop build does not expose the web server the same way for remote browser access.

Verify Yozakura is running on your computer at `http://localhost:4396`.

### 2. Connect securely with ngrok + Google OAuth

[ngrok](https://ngrok.com/) gives your local server an HTTPS URL you can open from anywhere, and its free tier supports **Google OAuth** via a Traffic Policy file (capped at 5 Monthly Active Users, 1 GB egress/month, and 20,000 requests/month—plenty for single-user play).

1. Install ngrok and authenticate your agent (`ngrok config add-authtoken <YOUR_TOKEN>`).
2. Create a file named `policy.yml` restricting access to your Google account (replace `your.email@gmail.com` with your email):

```yaml
on_http_request:
  - actions:
      - type: oauth
        config:
          provider: google
  - expressions:
      - "actions.ngrok.oauth.identity.email != 'your.email@gmail.com'"
    actions:
      - type: deny
```

3. Start the tunnel pointing to Yozakura's port:

```bash
ngrok http 4396 --traffic-policy-file=policy.yml
```

4. Open the `https://...ngrok-free.app` URL shown by ngrok on your phone and sign in with your Google account.

:::note Privacy & security note for ngrok
With `ngrok http` + Google OAuth, connections are encrypted in transit over HTTPS and blocked for anyone except your Google email. However, because ngrok terminates TLS at its edge to enforce Google OAuth, ngrok's edge servers briefly see the unencrypted HTTP traffic in memory. If you want strict device-to-device encryption with no third-party TLS termination, use **Tailscale** below instead.
:::

### Alternative: Tailscale (or Local Wi-Fi)

- **[Tailscale](https://tailscale.com/)** (recommended alternative to ngrok): Free for personal use, no 1 GB/month transfer cap, nothing exposed to the public internet, and end-to-end WireGuard encryption using keys that stay strictly on your own devices. Install Tailscale on your computer and phone, then open `http://<your-computer-tailscale-ip>:4396` from your phone anywhere.
- **Same Wi-Fi network**: If your phone and computer are on the same trusted home Wi-Fi, you can connect directly to `http://<your-computer-local-ip>:4396` (you may need to allow port `4396` in your computer's firewall).
