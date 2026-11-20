# Real-Time Audio Visualizer (OSiRV)

Browser based real time audio spectrum and waveform visualizer

## Overview

Developed as a seminar project for *Image Processing and Computer Vision* (*Obrada slike i računalni vid*) at FERIT Osijek (2025). The application visualizes audio tracks from `songs/` or user-uploaded `.mp3` files using logarithmic frequency mapping, decibel scaling (`-60 dB` to `0 dB`) and adjustable EMA smoothing.

## Visualization Modes

- **Bars:**
- **Line:**
- **Spectrogram:**
- **Scope:**
- **Circular:**.

## Controls & Features

- Load `.mp3` files from `songs/` (when directory listing is enabled) or upload local audio files via **+ Dodaj .mp3**.
- Adjust temporal smoothing (`0.00` to `0.95`) in real time using the **Smoothing** slider
- **`Space`**: Play / Pause audio
- **`V`**: Cycle through visualization modes (`Bars` → `Line` → `Spectrogram` → `Scope` → `Circular`)

## Tech Stack

- **JavaScript**, **p5.js**, **p5.sound**
- **HTML5 / CSS3**
- **Documentation:** Full theoretical background, implementation details, test signals and genre evaluation in `Slaven_Aleric_OSiRV.pdf`
