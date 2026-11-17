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

:::warning Do not install Termux from Google Play
The Google Play Store version of Termux is outdated and unmaintained, which causes package installation failures. Download Termux from **[F-Droid](https://f-droid.org/packages/com.termux/)** or the **[Termux GitHub Releases](https://github.com/termux/termux-app/releases)** page instead.
:::

### 2. Install and start Yozakura

Open Termux and run:

```bash
curl -fsSL https://raw.githubusercontent.com/mistval/yozakura/main/scripts/install_termux.sh | bash
```

This installs the required Termux packages, clones Yozakura into `~/yozakura`, creates `~/start_yozakura.sh`, builds the app, and starts the server. First-time setup takes roughly 5 minutes.

When you see `Server listening on port 4396`, Yozakura is ready. Open your phone's browser and go to:

```text
http://localhost:4396
```

You should see the Yozakura welcome screen (on mobile, it defaults to the Mobile layout and pre-fills OpenRouter defaults for convenience).

### 3. Starting Yozakura later & keeping it alive

- **Next time you launch**: Open Termux and run `./start_yozakura.sh`.
- **Keep Termux from being killed in the background**: Android aggressively suspends background apps. Disable battery optimization for Termux in Android Settings and tap **Acquire wake lock** in Termux's notification shade while running chats.
- **Full-screen app (PWA)**: In Chrome on Android, open the menu (`⋮`) on `http://localhost:4396` and tap **Add to Home screen** → **Install** (or **Install app**) to hide the browser address bar and tab strip. Updating Yozakura later via `./start_yozakura.sh` automatically updates the PWA—you do not need to delete and reinstall it.

---

## Hosted on a Computer

If you run local LLMs/image models on your computer, want shared data between PC and mobile, or want to avoid Termux setup, run Yozakura on your computer and connect from your phone's browser.

### 1. Run Yozakura (Docker or Git clone)

Follow the [Getting Started](getting-started.md) guide and choose **either [Docker](getting-started.md#docker) or [Git clone](getting-started.md#git-clone)**—do **not** use the Electron app, since the Electron desktop build does not expose the web server the same way for remote browser access.

Verify Yozakura is running on your computer at `http://localhost:4396`.

### 2. Connect privately with Tailscale

[Tailscale](https://tailscale.com/) creates a private network between your own devices (free for personal use, no router setup needed, and works over both Wi-Fi and cellular data).

1. Install **[Tailscale](https://tailscale.com/download)** on your computer and sign in.
2. Install the **Tailscale** app on your phone (from Google Play or the App Store) and sign in with the **same account**.
3. Find your computer's Tailscale IP address (`100.x.y.z`) in the Tailscale app/tray menu (or by running `tailscale ip -4`).
4. Make sure Tailscale is toggled **On** on both devices, then open your phone's browser and go to:

```text
http://<your-computer-tailscale-ip>:4396
```

**Q:** Is Tailscale secure (even with an `http://` address)?
**A:** Yes, even though the URL starts with `http://`, Tailscale encrypts all traffic directly between your devices and keeps Yozakura off the public internet, so Wi-Fi networks, cell carriers, and outsiders cannot read your chats. Tailscale is widely trusted to keep traffic private, though you do need to place some level of trust in Tailscale's servers. If that concerns you, look into the self-hosted options below.

### 3. Install as a full-screen app (PWA, optional)

Installing Yozakura as a Progressive Web App (PWA) hides the mobile browser's address bar and tab strip so you get the full screen for chat. On Android Chrome, full-screen PWA installation requires an `https://` address rather than `http://<tailscale-ip>:4396`:

1. Open the **[Tailscale Admin Console → DNS](https://console.tailscale.com/admin/dns)** page, make sure **MagicDNS** is enabled, and click **Enable HTTPS** under **HTTPS Certificates**. (Tailscale notes that enabling HTTPS publishes your machine's `*.ts.net` name to Certificate Transparency logs, though only your Tailscale devices can actually connect to it.)
2. On your computer, expose Yozakura over HTTPS on a non-443 port such as `4443` (avoiding common Windows/OS port `443` conflicts):

```bash
tailscale serve --bg --https=4443 http://localhost:4396
```

3. Run `tailscale serve status` to view your private `https://<machine>.<tailnet>.ts.net:4443` URL, and open it on your phone.
4. Install it as an app from your phone's browser:
   - **Android (Chrome):** Open the menu (`⋮`) and tap **Add to Home screen** → **Install** (or **Install app**).
   - **iOS (Safari):** Tap **Share** → **Add to Home Screen**.

Updating Yozakura on your computer later should **not** require deleting or reinstalling the app.

### Other private options (Same Wi-Fi, WireGuard, or Headscale)

- **Same Wi-Fi only:** If you only play on your home Wi-Fi, you don't need Tailscale—open `http://<your-computer-local-ip>:4396` directly (you may need to allow port `4396` in your firewall).
- **Zero third-party servers:** If you don't want to rely on Tailscale's servers at all, look into setting up **WireGuard** directly or self-hosting **Headscale** (an open-source alternative to Tailscale's coordination server). Both require more manual networking setup and are beyond the scope of this guide.
