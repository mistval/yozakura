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

Yozakura works on mobile browsers and automatically selects the mobile layout during first-time setup on narrow screens (you can also switch between Mobile and Desktop layouts anytime under [Appearance Settings → Layout](yozakura://?settings=true&settingspath=appearance)).

There are two main ways to run Yozakura on mobile:

1. **[Directly on Android with Termux](#android-via-termux)**: Everything runs locally on your phone. Best if you use cloud LLM providers (like OpenRouter) and don't want to leave a computer running.
2. **[Hosted on a Computer](#hosted-on-a-computer)**: Run Yozakura on your PC/Mac/Linux machine and connect from your phone. Best if you run local models on your computer, want to share Yozakura data between desktop and mobile, or if you're on iOS which does not support Termux.

---

## Android via Termux

Termux lets you run Yozakura directly on Android without a separate computer.

### 1. Install Termux

:::warning[Do not install Termux from Google Play]

The Google Play Store version of Termux is outdated and unmaintained, which causes package installation failures. Download Termux from **[F-Droid](https://f-droid.org/packages/com.termux/)** or the **[Termux GitHub Releases](https://github.com/termux/termux-app/releases)** page instead.

:::

### 2. Install and start Yozakura

Open Termux and run:

```bash
curl -fsSL https://raw.githubusercontent.com/mistval/yozakura/main/scripts/install_termux.sh | bash
```

This downloads Yozakura and other required packages, installs, and starts the server. First-time setup takes roughly 5 minutes. A `./start_yozakura.sh` script is also created for you to run to start Yozakura later (if your phone reboots or Android kills it or whatever). Running this script will also update Yozakura.

When you see `Server listening on port 4396`, Yozakura is ready. Open your phone's browser and go to:

```text
http://localhost:4396
```

You should see the Yozakura welcome screen (on mobile, it defaults to the Mobile layout and pre-fills OpenRouter defaults for convenience).

### 3. Full-Screen App

In Chrome on Android, open the menu (`⋮`) on `http://localhost:4396` and tap **Add to Home screen** → **Install** (or **Install app**). This adds Yozakura to the home screen for easy access, and also removes the browser top bar and bottom bar, so you have more screen real-estate to take advantage of. Even if you install Yozakura to the home screen, you still need to keep it running in Termux or it will fail to launch. Updating Yozakura later via `./start_yozakura.sh` automatically updates the PWA. You'll need to restart the app, but it's not necessary to delete and re-install it.

### 4. Starting Yozakura later & keeping it alive

- **To start Yozakura again**: Open Termux and run `./start_yozakura.sh`.
- **Keep Termux from being killed in the background**: Android aggressively suspends background apps. If Yozakura is getting killed frequently while you're using it, try disabling battery optimization for Termux in Android Settings and tap **Acquire wake lock** in Termux's notification shade while running chats.

---

## Hosted on a Computer

If you run local LLMs/image models on your computer, want shared data between PC and mobile, or want to avoid Termux setup, run Yozakura on your computer and connect from your phone's browser.

### 1. Run Yozakura

Follow the [Getting Started](getting-started.md) guide to install and start Yozakura (the **Electron** app is the easiest option — just keep the Yozakura window open or minimized on your computer while using it from your phone; if you'd rather run Yozakura in the background without a window open, use **[Docker](getting-started.md#docker)** or **[Git Clone](getting-started.md#git-clone)**).

_(Note: when running via Docker or Git Clone, verify `http://localhost:4396` opens on your computer; with Electron, `http://localhost:4396` is served automatically unless port `4396` was already taken by another process.)_

### 2. Connect privately with Tailscale

[Tailscale](https://tailscale.com/) creates an encrypted private tunnel between your own devices (free for personal use, no router setup needed, and works over both Wi-Fi and cellular data).

1. Install **[Tailscale](https://tailscale.com/download)** on your computer and sign in.
2. Install the **Tailscale** app on your phone (from Google Play or the App Store) and sign in with the **same account**. Make sure Tailscale is toggled **On** on both devices.
3. Open the **[Tailscale Admin Console → DNS](https://console.tailscale.com/admin/dns)** page, make sure **MagicDNS** is enabled, and click **Enable HTTPS** under **HTTPS Certificates**. (Tailscale notes that enabling HTTPS publishes your machine's `*.ts.net` name to Certificate Transparency logs, though only your Tailscale devices can actually connect to it.)
4. On your computer, run:

```bash
tailscale serve --bg --https=4443 http://localhost:4396
```

5. Run `tailscale serve status` to view your private `https://<machine>.<tailnet>.ts.net:4443` URL, and open it on your phone.

:::info[Is Tailscale secure?]

In a word: yes. Tailscale encrypts all traffic directly between your devices and keeps Yozakura off the public internet, so Wi-Fi networks, cell carriers, and outsiders cannot read your chats. However, Tailscale itself behaving maliciously or being hacked could result in eavesdropping. Tailscale is widely trusted, including by large corporations, but if this concerns you, there are some self-hosted options listed below though they take more setup.

:::

### 3. Install as a full-screen app (PWA, optional)

Installing Yozakura as a Progressive Web App (PWA) hides the mobile browser's address bar and tab strip so you get the full screen for chat:

- **Android (Chrome):** Open the menu (`⋮`) on your `https://<machine>.<tailnet>.ts.net:4443` page and tap **Add to Home screen** → **Install** (or **Install app**).
- **iOS (Safari):** Tap **Share** → **Add to Home Screen**.

Note that even after installing Yozakura to the home screen, you will still need to run Yozakura on your computer and it needs to be accessible via Tailscale, or else the app will fail to launch. When you update Yozakura on your computer, you'll have to restart the app, but you should **not** need to delete and re-install it.

### Other private options (Same Wi-Fi, WireGuard, or Headscale)

- **Same Wi-Fi only:** If you only use Yozakura on a trusted home Wi-Fi network and it's acceptable for other people on your Wi-Fi network to have access to your Yozakura install, start the server via Git Clone or Docker with `HOST=0.0.0.0` (e.g. `HOST=0.0.0.0 PORT=4396 npm run start --prefix server`, or `-p 4396:4396 -e HOST=0.0.0.0` in Docker), allow port `4396` in your firewall if needed, and open `http://<your-computer-local-ip>:4396`.
- **Zero third-party servers:** If you don't want to rely on Tailscale's servers at all, look into setting up **WireGuard** directly or self-hosting **Headscale** (an open-source alternative to Tailscale's coordination server). Both require more manual networking setup and are beyond the scope of this guide.
