# Project: PROCITY — A Live 3D Linux Process Visualization

You are a senior Linux systems engineer, Python developer, and 3D graphics developer. Build a complete, functional, real-time Linux process visualization application for **Omarchy Linux (Arch Linux + Hyprland)**.

The application should recreate the visual concept shown in the reference screenshot: a dark, futuristic computer setup with a monitor displaying a neon-colored 3D city made of skyscrapers.

The city represents the actual running processes on the Linux machine. This must be a working system-monitoring application, not a static 3D animation or mockup.

**You must implement the application, install dependencies where appropriate, test it, and provide instructions to run it. Do not stop after creating a plan or scaffolding the project.**

---

# 1. Core Concept

Create an interactive 3D city in which:

* Every running Linux process is represented by a building.
* Every building corresponds to a real process, identified by its PID.
* Building height represents memory consumption by default.
* Building color represents CPU usage.
* Building animation and lighting update as system resource usage changes.
* Processes that terminate cause their buildings to disappear.
* Newly launched processes appear as new buildings.
* Clicking a building displays detailed information about that process.

The city should resemble a futuristic cyberpunk metropolis with dense skyscrapers, neon blue and orange lighting, a dark background, and a clean, cinematic perspective.

The visualization must use real system data.

---

# 2. Technology Stack

Use the following architecture:

### Frontend

* Three.js for 3D rendering.
* Vite for frontend development and production builds.
* TypeScript for application logic.
* HTML and CSS for the interface.
* InstancedMesh or another efficient rendering technique to support thousands of buildings without creating a separate draw call for every building.

### Backend

* Python 3.
* FastAPI for a local REST API and WebSocket server.
* psutil for process information and CPU/RAM statistics.
* asyncio for asynchronous monitoring and updates.
* pynvml or nvidia-smi for NVIDIA GPU statistics, with graceful fallback if unavailable.

### Communication

* WebSocket for real-time updates.
* REST API for initial system information and process details.
* Bind the server to 127.0.0.1 only.

Use a clean separation between frontend rendering, system monitoring, and API communication.

---

# 3. Visual Design

The visual appearance is a major requirement.

## City environment

Create a futuristic, dense, 3D city with:

* A nearly black background.
* Neon blue, cyan, purple, and orange accents.
* Hundreds of skyscrapers arranged in a grid with slight variations in height and width.
* Glowing building edges and illuminated windows.
* Subtle atmospheric fog.
* A dark reflective ground plane with a subtle grid.
* A distant skyline with smaller buildings.
* A cinematic perspective camera looking down at the city from an elevated angle.

Use a palette inspired by futuristic cyberpunk architecture:

* Background: #080B12
* Building base: #101A2B
* Neon blue: #00A6FF
* Cyan: #00F0FF
* Orange: #FF8A3D
* Purple: #8B5CF6
* High CPU warning: #FF3B5C
* Text: #E8F0FF

Avoid excessive bloom, excessive particles, and overly bright backgrounds.

The scene should feel like a sophisticated system-monitoring visualization, not a game.

## Building design

Each building should have:

* A rectangular or slightly varied skyscraper shape.
* A dark structural body.
* Thin glowing edges.
* Small illuminated windows or horizontal bands.
* A subtle glow corresponding to CPU usage.
* Smooth height transitions when resource usage changes.

Use efficient geometry and instanced rendering.

Buildings should be visually distinct but belong to a consistent architectural style.

---

# 4. Process-to-Building Mapping

Create a deterministic mapping between processes and buildings.

Each building must represent one actual process.

### Building height

By default, building height should reflect the process's resident memory usage (RSS).

Normalize building heights using a logarithmic scale so that processes with large memory consumption do not make all other buildings invisible.

Allow switching the height metric between:

* Memory usage (RSS).
* CPU usage.
* Number of threads.
* Process count grouped by application, if grouping is implemented.

### Building color

Map CPU usage to a color gradient:

* Low CPU: dark blue.
* Moderate CPU: cyan.
* High CPU: orange.
* Very high CPU: red.

Smooth color transitions over time.

### Building position

Arrange buildings in a stable grid or clustered layout.

The same process should retain its position while it remains alive, even if its CPU or memory usage changes.

When a process terminates, remove its building with a short fade-out animation.

When a new process appears, assign it a building and animate it into the city.

Avoid unnecessary rearrangement of the entire city during each update.

### Process identity

Use PID plus process creation time as the process identity to avoid incorrectly reusing a building when a PID is recycled.

---

# 5. Live System Monitoring

Collect real system data from Linux.

For each process, retrieve:

* PID.
* Process name.
* Command line, subject to permission restrictions.
* Username, when accessible.
* CPU percentage.
* Resident memory usage in bytes and MB.
* Memory percentage.
* Number of threads.
* Process status.
* Parent PID.
* Process creation time.

Also collect system-wide statistics:

* Total CPU utilization.
* Per-core CPU utilization.
* Total RAM.
* Used RAM.
* Available RAM.
* Swap usage.
* System uptime.
* Process count.
* NVIDIA GPU utilization, memory usage, temperature, and power consumption, when available.

Use psutil's CPU sampling correctly. Avoid reporting misleading CPU values from the first sample.

Handle AccessDenied, NoSuchProcess, ZombieProcess, and other normal Linux process-monitoring errors gracefully.

Never require root privileges for the default monitoring mode.

Do not read process memory, inject into processes, attach debuggers, or inspect process contents. Only collect ordinary process metadata and resource statistics.

---

# 6. User Interface

Create a minimal, polished interface that complements the city.

## Main HUD

Place a transparent dark panel in the upper-left corner displaying:

* Application name: PROCITY.
* Total CPU usage.
* RAM usage.
* GPU usage, when available.
* Number of active processes.

Example:

PROCITY

CPU      18.4%
RAM      62.1%
GPU      34%
PROCESSES  247

Values must update in real time.

## Process details panel

When a building is clicked, display a panel containing:

* Process name.
* PID.
* Parent PID.
* CPU usage.
* Memory usage.
* Memory percentage.
* Number of threads.
* Username.
* Process status.
* Command line, if accessible.

Include a button to focus the camera on the selected building.

The process details panel must not execute commands or terminate processes.

## Search

Implement a search bar that allows users to search for a process by:

* Process name.
* PID.
* Username.

When a result is selected:

* Focus the camera on the corresponding building.
* Highlight the building.
* Open its process details panel.

## Filters

Add functional filters for:

* All processes.
* High CPU usage.
* High memory usage.
* User processes.
* System processes.

Provide a sorting option for CPU usage and memory usage.

Filtering should highlight or isolate matching buildings without corrupting the underlying process data.

## Camera controls

Support:

* Mouse drag to rotate the camera.
* Scroll wheel to zoom.
* Right-click drag or equivalent to pan.
* Double-click a building to focus on it.
* A reset-camera button.
* A smooth transition when focusing on a building.

Make the camera controls work properly on desktop Linux.

---

# 7. Performance Requirements

The application must remain responsive while monitoring a real Linux system.

Requirements:

* Support at least 1,000 process buildings in the initial implementation.
* Target smooth rendering at 60 FPS on a capable GPU.
* Use instanced rendering and reuse geometries and materials.
* Avoid creating new objects on every monitoring update.
* Separate monitoring update frequency from rendering frequency.
* Update process data approximately every 1 second by default.
* Interpolate building heights and colors smoothly between updates.
* Limit expensive shadow calculations.
* Use efficient picking for building selection.
* Avoid unnecessary React-style frontend re-rendering if using a rendering architecture that does not require it.

The visualization should continue functioning if GPU monitoring is unavailable.

Include a configurable process display limit and a way to choose the most resource-intensive processes when the number of processes exceeds that limit.

Do not silently omit processes without making the active display limit clear.

---

# 8. Application Layout

Use a clean project structure similar to:

procity/
├── backend/
│   ├── main.py
│   ├── monitor.py
│   ├── models.py
│   ├── gpu_monitor.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── main.ts
│   │   ├── scene/
│   │   │   ├── City.ts
│   │   │   ├── Building.ts
│   │   │   ├── Camera.ts
│   │   │   └── Interaction.ts
│   │   ├── ui/
│   │   │   ├── HUD.ts
│   │   │   ├── ProcessPanel.ts
│   │   │   ├── Search.ts
│   │   │   └── Filters.ts
│   │   ├── services/
│   │   │   └── api.ts
│   │   └── styles/
│   │       └── main.css
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── scripts/
│   ├── install.sh
│   ├── run.sh
│   └── uninstall.sh
├── README.md
└── .gitignore

You may modify the structure if there is a clear technical reason, but maintain separation between frontend, backend, monitoring, and rendering.

---

# 9. Omarchy Integration

The application must run natively on Omarchy Linux.

Create:

### Installation script

A script that:

* Checks for Python 3, Node.js, and npm.
* Checks for the required development tools.
* Creates a Python virtual environment.
* Installs backend dependencies.
* Installs frontend dependencies.
* Builds the frontend.
* Creates a launcher script.
* Reports missing dependencies with clear instructions.

Do not blindly install unrelated packages or modify system configuration.

Use the existing Omarchy environment and avoid replacing its window manager, shell, or desktop configuration.

### Run script

Create a script that:

1. Starts the Python backend.
2. Starts the frontend in production mode or serves the built application through the backend.
3. Opens the application in the default browser or a dedicated application window.
4. Shuts down the backend cleanly when the application exits.

Prefer a standalone application window without browser tabs or unnecessary browser controls.

### Optional Hyprland integration

Provide an optional Hyprland window rule or launcher configuration to open the application in a dedicated full-screen window.

Do not automatically modify the user's Hyprland configuration. Provide the optional configuration separately with clear instructions.

---

# 10. Application Modes

Implement these modes:

### Live Mode

Display actual running processes and continuously update the city.

### Overview Mode

Show the entire city from a comfortable elevated camera angle.

### Focus Mode

Focus on a selected process and display its resource usage.

### Resource Mode

Allow switching the primary visualization metric between CPU, RAM, and thread count.

### Demo Mode

Provide synthetic process data for testing the visualization when the backend is unavailable.

Clearly label Demo Mode so synthetic data is never confused with real system data.

---

# 11. Reliability and Security

* Bind the API to localhost only.
* Do not expose a network-accessible server by default.
* Do not require sudo to run the application.
* Do not execute commands supplied by process names, command lines, or frontend input.
* Validate all API inputs.
* Handle backend disconnections and reconnect automatically.
* Display a clear connection status indicator.
* Ensure the application remains usable if individual process data cannot be accessed.
* Do not kill or modify processes.
* Do not collect or transmit system information externally.

---

# 12. Testing

Implement meaningful tests for:

* Process data collection.
* Handling inaccessible and terminated processes.
* Stable process identity.
* Building data mapping.
* Resource normalization.
* API endpoints.
* WebSocket connection and reconnection.
* Search and filtering logic.

Run the tests and fix failures.

Also verify:

1. The backend starts successfully.
2. The frontend builds successfully.
3. The visualization loads in a browser.
4. The city updates when processes start and stop.
5. CPU and memory statistics update correctly.
6. Building selection and process details work.
7. Camera controls work.
8. The application shuts down cleanly.

If a test requires a graphical environment that is unavailable, clearly state that it was not verified rather than claiming it passed.

---

# 13. Development Workflow

Follow this workflow:

1. Inspect the existing working directory and Omarchy environment.
2. Create the project structure.
3. Implement the backend monitoring system.
4. Implement the API and WebSocket connection.
5. Build the Three.js city renderer.
6. Connect real process data to buildings.
7. Implement the HUD, search, filters, and process details panel.
8. Implement camera controls and animations.
9. Implement installation and launch scripts.
10. Run tests and fix errors.
11. Build the production frontend.
12. Start the application and verify it works.

Do not stop at a static mockup.

If something is technically impossible in the current environment, explain the limitation and implement a working alternative.

---

# 14. Final Deliverables

When finished, provide:

* The complete source code.
* A working installation script.
* A working run script.
* A working uninstall script.
* A README with setup and usage instructions.
* A list of installed dependencies.
* Test results.
* Exact commands to launch the application on Omarchy.
* Any known limitations.

**Start by inspecting the current environment, then implement the application end to end. Prioritize a working, visually polished live 3D city over unnecessary features.**
