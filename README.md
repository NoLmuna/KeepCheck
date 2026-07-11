# KeepCheck

An offline-first PWA for logging and rating food and drink spots. Built with Next.js, Dexie.js, and Tailwind CSS. Your data stays on your device—no cloud, no accounts, fully private.


## Project Structure

    keepcheck/
        app/            - Main UI, search/sort logic, components
        public/         - Static assets (logo, icons)
        manifest.ts     - PWA configuration
        sw.js           - Service worker for offline mode
        package.json    - Dependencies and scripts


## Requirements

- Node.js (v18 or later recommended)
- A modern web browser (Chrome, Edge, Safari, etc.)
- npm, yarn, pnpm, or bun


## Setup Guide for New Cloners

### Step 1 - Clone or Download

    git clone https://github.com/yourusername/keepcheck.git
    cd keepcheck


### Step 2 - Install Dependencies

Run this in your terminal:

    npm install


### Step 3 - Start Development

    npm run dev

Open http://localhost:3000 in your browser.


## Running KeepCheck

Just open the app in your browser. Since it is a PWA, you can "Install" it via your browser menu to use it as a standalone app on your desktop or phone home screen.


## How It Works

    1. Your data is managed by Dexie.js (IndexedDB wrapper) stored locally in your browser.
    2. Next.js App Router handles the UI state reactively using useLiveQuery.
    3. Tailwind CSS handles the theme toggling via class-based dark mode.
    4. Service Worker (sw.js) caches the app shell for offline reliability.


## Tech Stack

    Next.js         - React framework for the App Router
    Dexie.js        - Local IndexedDB storage for offline-first data
    Tailwind CSS    - Utility-first styling
    Lucide React    - Clean, consistent iconography
    Vercel          - Deployment platform


## Roadmap & Future Scope

- Direct JSON restoration (Import functionality)
- Advanced categorization (Food Truck, Bakery, Bar, etc.)
- Data visualization (Charts for your ratings over time)
