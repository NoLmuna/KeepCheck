KeepCheck: Rate and Remember Food Spots
KeepCheck is an offline-first Progressive Web Application (PWA) designed for foodies and explorers to catalog, rate, and curate their favorite food and drink experiences. Unlike traditional apps that rely on cloud servers, KeepCheck prioritizes data sovereignty—all your logs reside securely on your own device.

Core Features
Offline-First Architecture: Built on IndexedDB using Dexie.js, ensuring your data is accessible instantly, even without an internet connection.

Categorized Logging: Easily classify spots as Café or Restaurant to organize your personal database.

Reactive UI: Includes real-time search filtering, dynamic sorting (Newest, Highest, Lowest), and a seamless theme toggle (Light/Dark mode).

Data Portability: Integrated backup system allowing you to export your entire database to a JSON file and restore it whenever needed.

PWA Ready: Optimized for installation on iOS and Android, providing a native-like experience directly from your home screen.

Technology Stack
Framework: Next.js (App Router)

Database: Dexie.js (IndexedDB wrapper)

Styling: Tailwind CSS

Deployment: Vercel

Getting Started
Prerequisites
Node.js (v18 or later recommended)

npm, yarn, or pnpm

Installation
Clone the repository:

Bash
git clone [your-repository-url]
cd keepcheck
Install dependencies:

Bash
npm install
Start the development server:

Bash
npm run dev
Open http://localhost:3000 to view the application in your browser.

Project Structure
app/: Contains the main page logic, layout, and global styles.

public/: Contains static assets, including the application logo and manifest icons.

sw.js: Service worker configuration for offline capabilities.

Roadmap & Future Scope
The project is currently in active development. Future planned improvements include:

Enhanced Categorization: Expanding tags beyond Cafe/Restaurant (e.g., Food Truck, Bakery).

Advanced Filtering: Multi-select filters for combined searching.

Import Functionality: Direct JSON restoration within the UI.

License
This project is personal software. Feel free to use and modify it for your own needs.