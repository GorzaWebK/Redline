// The five settings the circuits are grouped into: sky, light, ground colour and
// which scenery is scattered around.
export const THEMES = {
  meadow: {
    name: 'Meadow', blurb: 'Rolling green hills on a bright day',
    skyTop: 0x2f6fd0, skyBottom: 0xd4e8f7, sunGlow: 0xfff3d0,
    fog: 0xcfe0ee, fogNear: 300, fogFar: 1500,
    sun: 0xfff4e0, sunInt: 2.8, sunDir: [0.45, 0.8, 0.35],
    hemiSky: 0xbcd8ff, hemiGround: 0x4a6a32, hemiInt: 1.0,
    ground: [0x4f8f3a, 0x3c7a2c], hill: 1, mountains: 0x7f9fb8,
    props: 'trees', wall: [0xe8e8e8, 0xd23b2c], kerb: [0xd8322a, 0xf2f2f2], night: false,
  },
  canyon: {
    name: 'Canyon', blurb: 'Red rock and desert heat',
    skyTop: 0x3a78c8, skyBottom: 0xf3d6a8, sunGlow: 0xffe6b0,
    fog: 0xe8cfa6, fogNear: 300, fogFar: 1500,
    sun: 0xffe2b8, sunInt: 3.0, sunDir: [-0.4, 0.75, 0.5],
    hemiSky: 0xf0d8b8, hemiGround: 0x8a4a2a, hemiInt: 1.0,
    ground: [0xc98a50, 0xb5703c], hill: 1.4, mountains: 0xb0664a,
    props: 'desert', wall: [0xf0e6d6, 0x2c6fd2], kerb: [0x2c6fd2, 0xf2f2f2], night: false,
  },
  alpine: {
    name: 'Alpine', blurb: 'Snowy passes at golden hour',
    skyTop: 0x4a6fae, skyBottom: 0xf6d2b0, sunGlow: 0xffc890,
    fog: 0xdcd6dc, fogNear: 250, fogFar: 1300,
    sun: 0xffd2a0, sunInt: 2.4, sunDir: [0.6, 0.35, -0.5],
    hemiSky: 0xd6e2ff, hemiGround: 0x9aa4b4, hemiInt: 1.25,
    ground: [0xeef2f7, 0xd9e1ea], hill: 1.8, mountains: 0x8a98b8,
    props: 'pines', wall: [0xf2f2f2, 0x1d9a5a], kerb: [0x1d9a5a, 0xf2f2f2], night: false,
  },
  night: {
    name: 'Night City', blurb: 'Street lights and city glow',
    skyTop: 0x050812, skyBottom: 0x1c2240, sunGlow: 0x3a4670,
    fog: 0x10142a, fogNear: 120, fogFar: 900,
    sun: 0x9fb4ff, sunInt: 0.55, sunDir: [-0.3, 0.8, -0.4],
    hemiSky: 0x6a7ac0, hemiGround: 0x2a2a34, hemiInt: 1.15,
    ground: [0x22302a, 0x1a2520], hill: 0.2, mountains: 0x10162a,
    props: 'city', wall: [0xdedede, 0xe0a020], kerb: [0xe0a020, 0x1a1a1a], night: true,
  },
  riviera: {
    name: 'Riviera', blurb: 'Grand Prix circuits on a sunny coast: long straights, chicanes and hairpins',
    skyTop: 0x1f78d8, skyBottom: 0xbfe4f8, sunGlow: 0xfff6d8,
    fog: 0xcde6f3, fogNear: 320, fogFar: 1600,
    sun: 0xfff2d8, sunInt: 3.0, sunDir: [0.3, 0.85, -0.4],
    hemiSky: 0xc4e2ff, hemiGround: 0x6a8040, hemiInt: 1.05,
    ground: [0x7fa64a, 0x6a9440], hill: 0.6, mountains: 0x6f93b0,
    props: 'trees', wall: [0xf4f4f4, 0x1a3a8a], kerb: [0xe8322a, 0xf6f6f6], night: false,
  },
};
