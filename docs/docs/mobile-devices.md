---
title: Mobile Devices
sidebar_position: 4
description: Run Yozakura on Android with Termux or host it on your computer and access it privately from mobile via Tailscale.
keywords:
  - yozakura mobile
  - yozakura android
  - termux
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

### 2. Connect privately with Tailscale

[Tailscale](https://tailscale.com/) creates a private mesh network between your own devices (free for personal use, no router port forwarding needed, and works over both Wi-Fi and cellular data).

1. Install **[Tailscale](https://tailscale.com/download)** on your computer and sign in.
2. Install the **Tailscale** app on your phone (from Google Play or the App Store) and sign in with the **same account**.
3. Find your computer's Tailscale IP address (`100.x.y.z`) in the Tailscale app/tray menu (or by running `tailscale ip -4`).
4. Make sure Tailscale is toggled **On** on both devices, then open your phone's browser and go to:

```text
http://<your-computer-tailscale-ip>:4396
```

:::info Why Tailscale is secure (even with an `http://` address)
Your browser will show `http://` in the address bar when connecting to a Tailscale IP, **but your traffic is still fully encrypted end-to-end**:

- **Device-to-device WireGuard encryption:** Tailscale encrypts all network traffic on your phone and decrypts it only on your computer using keys that stay strictly on your own devices. Neither your Wi-Fi/mobile carrier nor Tailscale's servers can read your chats, API keys, or images—even if traffic passes through a Tailscale relay.
- **No public internet exposure:** Unlike port forwarding or public tunneling services, Yozakura is not given a public URL. Only devices signed into your personal Tailscale account can reach your computer's Tailscale IP at all.
- **Optional `https://` URL:** If you prefer a green lock / `https://` address (e.g., to avoid browser "Not secure" warnings or add to your home screen as a web app), enable **MagicDNS** and **HTTPS Certificates** in your Tailscale admin console and run `tailscale serve --bg http://127.0.0.1:4396` on your computer. That gives you a `https://<machine>.<tailnet>.ts.net` URL that still stays private to your Tailscale devices and terminates TLS directly on your own computer.
  :::

:::tip Same Wi-Fi alternative
If you only ever play while your phone and computer are on the same trusted home Wi-Fi, you don't even need Tailscale—you can connect directly to `http://<your-computer-local-ip>:4396` (you may need to allow port `4396` through your computer's firewall).
:::
