# MORPHA — Reference Implementation

This repository contains the official reference implementation for the MORPHA protocol, a system for non-verbal symbolic communication through morphing glyphs and sound influence.

The full protocol specification can be found in the `/protocol` directory.

## Status

This implementation is currently under development. It serves as a practical guide and testbed for the concepts defined in the MORPHA protocol.

## Tech Stack

-   **Vite:** For a fast and modern development environment.
-   **Three.js:** To manage the WebGL rendering context.
-   **GLSL:** Custom shaders for the glyph morphing and rendering logic.
-   **Vanilla JavaScript:** No heavy frameworks, keeping the core logic transparent.

## Getting Started

### Prerequisites

-   Node.js (v18 or higher)
-   npm
-   Google Cloud Platform account (for Google Drive integration)

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/kajica2/morpha-protocol.git
    cd morpha-protocol
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Set up environment variables:
    ```bash
    cp .env.example .env
    ```

    Then edit `.env` and add your Google API credentials:

    **Getting Google API Credentials:**
    - Go to [Google Cloud Console](https://console.cloud.google.com/)
    - Create a new project or select an existing one
    - Enable the Google Drive API
    - Go to **Credentials** → **Create Credentials** → **OAuth client ID**
    - Choose **Web application**
    - Add authorized JavaScript origins:
      - For local: `http://localhost:5173`
      - For production: `https://your-domain.com`
    - Copy your Client ID and API Key into `.env`

### Running the Development Server

To start the local development server with hot-reloading:

```bash
npm run dev
```

The application will be available at `http://localhost:5173`.

## Project Structure

-   `/protocol`: Contains all markdown files specifying the MORPHA open protocol, its governance, and extensions.
-   `/public`: Static assets.
-   `/src`: The main application source code.
    -   `/src/core`: Core engine, state management, and clock.
    -   `/src/glyphs`: The symbolic language engine (generation, resampling, queueing).
    -   `/src/audio`: Microphone input, sound analysis, and silence detection.
    -   `/src/render`: Three.js/WebGL setup, scene management, and mesh/material handling.
    -   `/src/ritual`: The user experience and interaction logic.
    -   `/src/export`: Canvas capture and artifact packaging.
    -   `/src/storage`: Integration with external storage (e.g., Google Drive).
    -   `/src/utils`: Shared utility functions.
-   `/shaders`: GLSL vertex and fragment shaders.
-   `/data`: Static data for glyphs, phonemes, etc.
-   `/scripts`: Node.js scripts for build-time tasks (e.g., `build-glyphs.js`).

## Philosophy

This implementation adheres to the core principles of the MORPHA protocol:

-   **Never cut, only morph:** All transitions are continuous.
-   **Silence is input:** Absence of sound is a meaningful signal that influences the system.
-   **Influence, not command:** User interactions are treated as environmental pressures, not direct controls.
-   **Save moments, not sessions:** The goal is to create durable, personal artifacts from ephemeral interactions.
