import WindowManager from "./WindowManager.js";
import * as THREE from "three";
import { FlyControls } from "three/addons/controls/FlyControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

let camera, scene, renderer, world;
let near, far;
let pixR = window.devicePixelRatio ? window.devicePixelRatio : 1;
let toruses = [];
let sceneOffsetTarget = { x: 0, y: 0 };
let sceneOffset = { x: 0, y: 0 };

let today = new Date();
today.setHours(0);
today.setMinutes(0);
today.setSeconds(0);
today.setMilliseconds(0);
today = today.getTime();

let internalTime = getTime();
let windowManager;
let initialized = false;
let controls;
const clock = new THREE.Clock();

let composer, bloomPass;

// get time in seconds since beginning of the day (so that all windows use the same time)
function getTime() {
  return (new Date().getTime() - today) / 1000.0;
}

if (new URLSearchParams(window.location.search).get("clear")) {
  localStorage.clear();
} else {
  // this code is essential to circumvent that some browsers preload the content of some pages before you actually hit the url
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState != "hidden" && !initialized) {
      init();
    }
  });

  window.onload = () => {
    if (document.visibilityState != "hidden") {
      init();
    }
  };

  function init() {
    initialized = true;

    // add a short timeout because window.offsetX reports wrong values before a short period
    setTimeout(() => {
      setupScene();
      setupWindowManager();
      resize();
      updateWindowShape(false);
      render();
      window.addEventListener("resize", resize);
    }, 500);
  }

  function setupScene() {
    camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      1,
      15000
    );
    camera.position.z = 1000;

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000000, 1, 15000);

    const pointLight = new THREE.PointLight(0xff2200, 3, 0, 0);
    pointLight.position.set(0, 0, 0);
    scene.add(pointLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 3);
    dirLight.position.set(0, 0, 1).normalize();
    scene.add(dirLight);

    const material = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      wireframe: true,
    });

    for (let j = 0; j < 1000; j++) {
      const radius = Math.random() * 10 + 5;
      const tube = Math.random() * 5 + 1;
      const tubularSegments = Math.floor(Math.random() * 150) + 50;
      const radialSegments = Math.floor(Math.random() * 20) + 8;
      const p = Math.floor(Math.random() * 10) + 2;
      const q = Math.floor(Math.random() * 10) + 2;

      const torusKnot = new THREE.Mesh(
        new THREE.TorusKnotGeometry(
          radius,
          tube,
          tubularSegments,
          radialSegments,
          p,
          q
        ),
        material
      );

      const scale = Math.random() * 15 + 2;
      torusKnot.scale.set(scale, scale, scale);
      torusKnot.position.x = 10000 * (0.5 - Math.random());
      torusKnot.position.y = 7500 * (0.5 - Math.random());
      torusKnot.position.z = 10000 * (0.5 - Math.random());
      torusKnot.rotationSpeed = {
        x: Math.random() * 0.05 - 0.025,
        y: Math.random() * 0.05 - 0.025,
        z: Math.random() * 0.05 - 0.025,
      };
      scene.add(torusKnot);
      toruses.push(torusKnot);
    }

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(pixR);
    renderer.setClearColor(0x000000, 1);
    renderer.toneMapping = THREE.ReinhardToneMapping;

    world = new THREE.Object3D();
    scene.add(world);

    renderer.domElement.setAttribute("id", "scene");
    document.body.appendChild(renderer.domElement);

    controls = new FlyControls(camera, renderer.domElement);
    controls.movementSpeed = 1000;
    controls.rollSpeed = Math.PI / 10;

    const renderScene = new RenderPass(scene, camera);

    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.5,
      0.4,
      0.85
    );
    bloomPass.threshold = 0;
    bloomPass.strength = 0;
    bloomPass.radius = 0;

    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);
  }

  function setupWindowManager() {
    windowManager = new WindowManager();
    windowManager.setWinShapeChangeCallback(updateWindowShape);
    windowManager.setWinChangeCallback(windowsUpdated);

    // here you can add your custom metadata to each windows instance
    let metaData = { foo: "bar" };

    // this will init the windowmanager and add this window to the centralised pool of windows
    windowManager.init(metaData);

    // call update windows initially (it will later be called by the win change callback)
    windowsUpdated();
  }

  function windowsUpdated() {
    updateNumberOfToruses();
  }

  function updateNumberOfToruses() {
    let wins = windowManager.getWindows();

    // update the positions of existing Torusknots based on the current window positions
    for (let i = 0; i < Math.min(toruses.length, wins.length); i++) {
      let torusKnot = toruses[i];
      let win = wins[i];

      let posTarget = {
        x: win.shape.x + win.shape.w * 0.5,
        y: win.shape.y + win.shape.h * 0.5,
      };

      torusKnot.position.x = posTarget.x;
      torusKnot.position.y = posTarget.y;
    }
  }

  function updateWindowShape(easing = true) {
    // storing the actual offset in a proxy that we update against in the render function
    sceneOffsetTarget = { x: -window.screenX, y: -window.screenY };
    if (!easing) sceneOffset = sceneOffsetTarget;
  }

  function render() {
    let t = getTime();

    windowManager.update();

    // calculate the new position based on the delta between current offset and new offset times a falloff value (to create the nice smoothing effect)
    let falloff = 0.05;
    sceneOffset.x =
      sceneOffset.x + (sceneOffsetTarget.x - sceneOffset.x) * falloff;
    sceneOffset.y =
      sceneOffset.y + (sceneOffsetTarget.y - sceneOffset.y) * falloff;

    // set the world position to the offset
    world.position.x = sceneOffset.x;
    world.position.y = sceneOffset.y;

    // rotate the Torusknots based on their individual rotation speeds
    toruses.forEach((torusKnot) => {
      torusKnot.rotation.x += torusKnot.rotationSpeed.x;
      torusKnot.rotation.y += torusKnot.rotationSpeed.y;
      torusKnot.rotation.z += torusKnot.rotationSpeed.z;
    });

    controls.update(clock.getDelta());
    composer.render();
    requestAnimationFrame(render);
  }

  // resize the renderer to fit the window size
  function resize() {
    let width = window.innerWidth;
    let height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
    composer.setSize(width, height);
  }
}
