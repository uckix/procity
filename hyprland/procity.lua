-- PROCity — optional Hyprland window rules (Lua config, Hyprland 0.54+ / Omarchy)
--
-- Not applied automatically. To use it, copy this file next to your config
-- and add to ~/.config/hypr/hyprland.lua:
--     dofile(os.getenv("HOME") .. "/.config/hypr/procity.lua")
-- The app window's title is "PROCity".

-- Maximized dedicated window:
hl.window_rule({ match = { title = "^PROCity$" }, maximize = true })

-- Or, for a true fullscreen kiosk-style window, use this instead:
-- hl.window_rule({ match = { title = "^PROCity$" }, fullscreen = true })
