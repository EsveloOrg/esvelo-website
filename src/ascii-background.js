/**
 * WebGL2 ASCII Background Effect
 * GPU-accelerated ASCII art with flowing noise patterns
 * Inspired by Raycast/Lusion chroma backgrounds
 */

class ASCIIBackground {
  constructor() {
    this.canvas = document.getElementById('ascii-canvas');
    if (!this.canvas) return;

    // Try WebGL2 first, fall back to WebGL1
    this.gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl');
    if (!this.gl) {
      console.error('WebGL not supported');
      return;
    }

    this.isWebGL2 = this.gl instanceof WebGL2RenderingContext;

    // Configuration
    this.cellSize = 10; // Size of each ASCII cell in pixels
    this.time = 0;
    this.mouse = { x: 0.5, y: 0.5 };
    this.smoothMouse = { x: 0.5, y: 0.5 };
    this.isHovering = false;
    this.hoverIntensity = 0;

    // Cumulative intensity - builds up with movement
    this.intensity = 0;           // Current intensity (0-1)
    this.targetIntensity = 0;     // Target to interpolate towards
    this.maxIntensity = 1.0;      // Maximum intensity when fully revealed

    // Scroll tracking
    this.lastScrollY = window.scrollY;
    this.isScrolling = false;
    this.scrollTimeout = null;

    // Track if user has actually interacted (ignore initial mouse position)
    this.hasInteracted = false;
    this.lastMouseX = -1;
    this.lastMouseY = -1;

    // Decay timeout - intensity decays when interaction stops
    this.decayTimeout = null;

    this.init();
  }

  // Vertex shader - simple fullscreen quad
  getVertexShader() {
    const prefix = this.isWebGL2 ? '#version 300 es\n' : '';
    const inKeyword = this.isWebGL2 ? 'in' : 'attribute';
    const outKeyword = this.isWebGL2 ? 'out' : 'varying';

    return `${prefix}
      precision highp float;
      ${inKeyword} vec2 aPosition;
      ${outKeyword} vec2 vUv;

      void main() {
        vUv = aPosition * 0.5 + 0.5;
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `;
  }

  // Fragment shader - ASCII rendering with noise
  getFragmentShader() {
    const prefix = this.isWebGL2 ? '#version 300 es\n' : '';
    const inKeyword = this.isWebGL2 ? 'in' : 'varying';
    const fragColor = this.isWebGL2 ? 'fragColor' : 'gl_FragColor';
    const fragColorDecl = this.isWebGL2 ? 'out vec4 fragColor;' : '';

    return `${prefix}
      precision highp float;

      ${inKeyword} vec2 vUv;
      ${fragColorDecl}

      uniform vec2 uResolution;
      uniform float uTime;
      uniform vec2 uMouse;
      uniform float uHoverIntensity;
      uniform float uCellSize;
      uniform float uIntensity; // Cumulative intensity from movement (0-1)

      // 3D Simplex noise (Stefan Gustavson's implementation)
      vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
      vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

      float snoise(vec3 v) {
        const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

        vec3 i = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);

        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);

        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + 2.0 * C.xxx;
        vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

        i = mod(i, 289.0);
        vec4 p = permute(permute(permute(
          i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));

        float n_ = 1.0 / 7.0;
        vec3 ns = n_ * D.wyz - D.xzx;

        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);

        vec4 x = x_ * ns.x + ns.yyyy;
        vec4 y = y_ * ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);

        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);

        vec4 s0 = floor(b0) * 2.0 + 1.0;
        vec4 s1 = floor(b1) * 2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));

        vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);

        vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
        p0 *= norm.x;
        p1 *= norm.y;
        p2 *= norm.z;
        p3 *= norm.w;

        vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
      }

      // Procedural ASCII character rendering using bit patterns
      // Each character is encoded as a 25-bit integer (5x5 grid)
      float character(int n, vec2 p) {
        p = floor(p * vec2(-4.0, 4.0) + 2.5);
        if (clamp(p.x, 0.0, 4.0) == p.x && clamp(p.y, 0.0, 4.0) == p.y) {
          int a = int(round(p.x) + 5.0 * round(p.y));
          if (((n >> a) & 1) == 1) return 1.0;
        }
        return 0.0;
      }

      // Multi-octave noise for organic blob shapes
      float fbm(vec3 p) {
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 1.0;

        // Layer 1: Large flowing shapes
        value += snoise(p * frequency) * amplitude;

        // Layer 2: Medium detail
        frequency *= 1.8;
        amplitude *= 0.5;
        value += snoise(p * frequency + 100.0) * amplitude;

        // Layer 3: Fine detail
        frequency *= 2.0;
        amplitude *= 0.4;
        value += snoise(p * frequency + 200.0) * amplitude;

        return value;
      }

      // Subtle light rays emanating from bright areas
      // Simple and performant - no neighbor sampling needed
      float subtleRays(vec2 uv, float brightness, float time, float seed) {
        float angle = atan(uv.y - 0.5, uv.x - 0.5);
        float dist = length(uv - 0.5);

        // Create subtle ray pattern
        float numRays = 8.0;
        float ray = sin(angle * numRays + seed + time * 0.1);
        ray = pow(max(0.0, ray), 8.0); // Sharp but not extreme

        // Gentle falloff
        float falloff = exp(-dist * 1.5);

        return ray * falloff * brightness * 0.3;
      }

      void main() {
        // Early exit if no intensity
        if (uIntensity < 0.001) {
          ${fragColor} = vec4(0.0, 0.0, 0.0, 1.0);
          return;
        }

        vec2 fragCoord = vUv * uResolution;

        // Calculate cell position
        vec2 cellPos = floor(fragCoord / uCellSize);
        vec2 cellUv = fract(fragCoord / uCellSize);
        vec2 cellCenter = (cellPos + 0.5) * uCellSize / uResolution;

        // Turbulence for organic distortion
        float turbScale = 0.003;
        float turbTime = uTime * 0.4; // Faster turbulence
        vec2 turb = vec2(
          snoise(vec3(cellCenter * uResolution * turbScale, turbTime)) * 60.0,
          snoise(vec3(cellCenter * uResolution * turbScale + 100.0, turbTime + 50.0)) * 60.0
        );

        // === CURSOR STIRRING - mouse displaces the noise field ===
        vec2 mousePos = uMouse * uResolution;
        vec2 toMouse = fragCoord - mousePos;
        float mouseDist = length(toMouse);

        // Circular stirring effect - swirls around cursor
        float stirRadius = 450.0;  // Radius of influence
        float stirStrength = exp(-mouseDist * mouseDist / (stirRadius * stirRadius * 0.5)) * uIntensity;

        // Calculate swirl angle based on distance and time
        float swirlAngle = atan(toMouse.y, toMouse.x);
        float swirlSpeed = 0.3 + (1.0 - stirStrength) * 0.5;  // Slower near center
        float swirlOffset = sin(mouseDist * 0.02 - uTime * swirlSpeed) * stirStrength * 80.0;

        // Tangential displacement (perpendicular to direction from mouse)
        vec2 tangent = vec2(-toMouse.y, toMouse.x) / max(mouseDist, 1.0);
        vec2 mouseTurb = tangent * swirlOffset;

        // Add radial push/pull waves emanating from cursor
        float radialWave = sin(mouseDist * 0.015 - uTime * 0.8) * stirStrength * 40.0;
        vec2 radialDir = toMouse / max(mouseDist, 1.0);
        mouseTurb += radialDir * radialWave;

        vec2 distortedPos = cellCenter * uResolution + turb + mouseTurb;

        // Generate blob pattern using multiple noise layers
        float blobScale = 0.0006;
        float timeScale = 0.25; // Much faster animation

        // Primary large sweeping blobs
        float blob1 = snoise(vec3(distortedPos * blobScale, uTime * timeScale));

        // Secondary shapes - creates holes and variation
        float blob2 = snoise(vec3(distortedPos * blobScale * 1.8 + 200.0, uTime * timeScale * 1.2 + 100.0));

        // Tertiary - more detail and holes
        float blob3 = snoise(vec3(distortedPos * blobScale * 3.0 + 400.0, uTime * timeScale * 0.9 + 200.0));

        // Additional hole-creating layer
        float holes = snoise(vec3(distortedPos * blobScale * 2.5 + 600.0, uTime * timeScale * 1.5 + 300.0));

        // Combine blobs - subtract holes layer to create more gaps
        float noise = blob1 * 0.5 + blob2 * 0.25 + blob3 * 0.15;
        // Subtract holes to create gaps in the shapes
        noise -= max(0.0, holes * 0.3);

        // Normalize to 0-1
        noise = noise * 0.5 + 0.5;

        // Higher threshold = more holes/gaps in shapes
        float threshold = 0.52;
        float blobMask = 0.0;

        if (noise > threshold) {
          float normalized = (noise - threshold) / (1.0 - threshold);
          // Smooth edge with solid center
          if (normalized > 0.2) {
            blobMask = 0.8 + normalized * 0.2;
          } else {
            float t = normalized / 0.2;
            blobMask = t * t * (3.0 - 2.0 * t) * 0.8;
          }
        }

        // Skip empty cells early
        if (blobMask < 0.01) {
          ${fragColor} = vec4(0.0, 0.0, 0.0, 1.0);
          return;
        }

        // === PROGRESSIVE REVEAL - More movement reveals more layers ===
        // Multiple noise layers that reveal progressively based on intensity
        float revealScale = 0.0006;

        // Layer 1 - appears first (at low intensity)
        float layer1 = snoise(vec3(distortedPos * revealScale, 0.0));
        layer1 = layer1 * 0.5 + 0.5;

        // Layer 2 - appears at medium intensity
        float layer2 = snoise(vec3(distortedPos * revealScale * 0.7 + 300.0, 50.0));
        layer2 = layer2 * 0.5 + 0.5;

        // Layer 3 - appears at high intensity
        float layer3 = snoise(vec3(distortedPos * revealScale * 1.3 + 600.0, 100.0));
        layer3 = layer3 * 0.5 + 0.5;

        // Layer 4 - appears at maximum intensity
        float layer4 = snoise(vec3(distortedPos * revealScale * 0.5 + 900.0, 150.0));
        layer4 = layer4 * 0.5 + 0.5;

        // Progressive thresholds - lower intensity = higher threshold = less visible
        // At intensity 0.25: only strongest peaks of layer1 visible
        // At intensity 0.5: layer1 + some layer2
        // At intensity 0.75: layers 1-3
        // At intensity 1.0: all layers fully visible

        float revealMask = 0.0;

        // Layer 1: starts revealing at intensity > 0.05
        float thresh1 = mix(0.75, 0.3, smoothstep(0.0, 0.4, uIntensity));
        if (layer1 > thresh1) {
          revealMask = max(revealMask, smoothstep(thresh1, thresh1 + 0.15, layer1));
        }

        // Layer 2: starts revealing at intensity > 0.25
        float thresh2 = mix(0.85, 0.35, smoothstep(0.2, 0.6, uIntensity));
        if (uIntensity > 0.2 && layer2 > thresh2) {
          revealMask = max(revealMask, smoothstep(thresh2, thresh2 + 0.15, layer2) * smoothstep(0.2, 0.35, uIntensity));
        }

        // Layer 3: starts revealing at intensity > 0.5
        float thresh3 = mix(0.9, 0.4, smoothstep(0.4, 0.8, uIntensity));
        if (uIntensity > 0.4 && layer3 > thresh3) {
          revealMask = max(revealMask, smoothstep(thresh3, thresh3 + 0.15, layer3) * smoothstep(0.4, 0.6, uIntensity));
        }

        // Layer 4: starts revealing at intensity > 0.75
        float thresh4 = mix(0.95, 0.45, smoothstep(0.7, 1.0, uIntensity));
        if (uIntensity > 0.7 && layer4 > thresh4) {
          revealMask = max(revealMask, smoothstep(thresh4, thresh4 + 0.15, layer4) * smoothstep(0.7, 0.9, uIntensity));
        }

        // Apply intensity as overall brightness multiplier
        float visibility = revealMask * uIntensity;

        // Skip if not revealed
        if (visibility < 0.01) {
          ${fragColor} = vec4(0.0, 0.0, 0.0, 1.0);
          return;
        }

        // Calculate brightness for character selection
        float brightness = blobMask * (0.3 + visibility * 0.5);

        // === CHARACTER VARIETY - adds depth with multiple symbol layers ===
        // High-frequency noise for local variation within similar brightness regions
        float charVariety1 = snoise(vec3(distortedPos * 0.003, uTime * 0.1)) * 0.5 + 0.5;
        float charVariety2 = snoise(vec3(distortedPos * 0.005 + 200.0, 0.0)) * 0.5 + 0.5;
        float charVariety3 = snoise(vec3(distortedPos * 0.008 + 400.0, uTime * 0.05)) * 0.5 + 0.5;

        // Mix variety into brightness for character selection - creates depth
        float charBrightness = brightness + (charVariety1 - 0.5) * 0.18 + (charVariety2 - 0.5) * 0.12 + (charVariety3 - 0.5) * 0.08;
        charBrightness = clamp(charBrightness, 0.0, 1.0);

        // Select ASCII character based on varied brightness
        // Characters encoded as 25-bit patterns (5x5 grid)
        // More characters for smoother transitions and depth
        int charCode = 4096; // . (dot)

        if (charBrightness > 0.05) charCode = 4096;      // .
        if (charBrightness > 0.10) charCode = 65600;     // :
        if (charBrightness > 0.16) charCode = 2228224;   // -
        if (charBrightness > 0.22) charCode = 163153;    // *
        if (charBrightness > 0.28) charCode = 4329604;   // +
        if (charBrightness > 0.34) charCode = 15255086;  // o
        if (charBrightness > 0.40) charCode = 13121101;  // &
        if (charBrightness > 0.46) charCode = 15252014;  // 8
        if (charBrightness > 0.52) charCode = 32505926;  // %
        if (charBrightness > 0.58) charCode = 13195790;  // @
        if (charBrightness > 0.64) charCode = 11512810;  // #
        if (charBrightness > 0.72) charCode = 33080895;  // M

        // Render character
        vec2 charUv = mod(fragCoord / (uCellSize * 0.5), 2.0) - vec2(1.0);
        float char = character(charCode, charUv);

        // Color - purple/green/blue variations like chroma effect
        // Multiple noise layers for rich color variation
        float colorNoise1 = snoise(vec3(distortedPos * 0.001, uTime * 0.15)) * 0.5 + 0.5;
        float colorNoise2 = snoise(vec3(distortedPos * 0.0015 + 500.0, uTime * 0.12)) * 0.5 + 0.5;
        float colorNoise3 = snoise(vec3(distortedPos * 0.0008 + 1000.0, uTime * 0.08)) * 0.5 + 0.5;

        // Define color palette - purple, green, blue, cyan
        vec3 purple = vec3(0.75, 0.5, 1.0);
        vec3 green = vec3(0.4, 0.9, 0.6);
        vec3 blue = vec3(0.5, 0.7, 1.0);
        vec3 cyan = vec3(0.4, 0.85, 0.9);
        vec3 white = vec3(0.95, 0.95, 1.0);

        // Blend colors based on noise
        vec3 color1 = mix(purple, green, colorNoise1);
        vec3 color2 = mix(blue, cyan, colorNoise2);
        vec3 tint = mix(color1, color2, colorNoise3);

        // Mix with white for softer look
        tint = mix(tint, white, 0.3);

        vec3 color = tint * char * brightness;

        // === HEIGHT-BASED GLOW - higher symbols glow more ===
        float heightFactor = fragCoord.y / uResolution.y;  // 0 at bottom, 1 at top
        float heightGlow = pow(heightFactor, 1.5) * 2.5;   // Exponential increase toward top

        // Add colored glow with height enhancement
        float glow = char * brightness * 0.2 * (1.0 + heightGlow);
        color += tint * glow * 0.6;

        // Additional bloom effect for top characters
        if (heightFactor > 0.4) {
          float bloomStrength = pow((heightFactor - 0.4) / 0.6, 1.2);  // Smooth ramp from 40% height
          vec3 bloomColor = mix(tint, white, 0.4);
          color += bloomColor * char * brightness * bloomStrength * 0.35;
        }

        // === SUBTLE LIGHT RAYS - simple per-character glow ===
        // No neighbor sampling - just add subtle rays from current character
        if (blobMask > 0.2) {
          float seed = cellPos.x * 17.3 + cellPos.y * 31.7;
          float rays = subtleRays(cellUv, blobMask, uTime, seed);

          // Soft white/colored ray glow
          vec3 rayColor = mix(tint, white, 0.6);
          color += rayColor * rays * visibility * 0.8;
        }

        // Apply visibility (already includes global + reveal mask)
        color *= visibility;

        ${fragColor} = vec4(color, 1.0);
      }
    `;
  }

  init() {
    const gl = this.gl;

    // Create shader program
    this.program = this.createProgram(this.getVertexShader(), this.getFragmentShader());
    if (!this.program) return;

    // Get attribute and uniform locations
    this.aPosition = gl.getAttribLocation(this.program, 'aPosition');
    this.uResolution = gl.getUniformLocation(this.program, 'uResolution');
    this.uTime = gl.getUniformLocation(this.program, 'uTime');
    this.uMouse = gl.getUniformLocation(this.program, 'uMouse');
    this.uHoverIntensity = gl.getUniformLocation(this.program, 'uHoverIntensity');
    this.uCellSize = gl.getUniformLocation(this.program, 'uCellSize');
    this.uIntensity = gl.getUniformLocation(this.program, 'uIntensity');

    // Create fullscreen quad
    const vertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ]);

    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // Setup
    this.resize();
    this.bindEvents();
    this.animate();
  }

  createShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  createProgram(vertexSource, fragmentSource) {
    const gl = this.gl;

    const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentSource);

    if (!vertexShader || !fragmentShader) return null;

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return null;
    }

    return program;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  bindEvents() {
    window.addEventListener('mousemove', (e) => {
      const newX = e.clientX;
      const newY = e.clientY;

      // Check if mouse actually moved (not just initial position detection)
      if (this.lastMouseX === -1) {
        // First event - just store position, don't trigger effect
        this.lastMouseX = newX;
        this.lastMouseY = newY;
        return;
      }

      // Calculate movement distance
      const dx = newX - this.lastMouseX;
      const dy = newY - this.lastMouseY;
      const moved = Math.sqrt(dx * dx + dy * dy);

      this.lastMouseX = newX;
      this.lastMouseY = newY;

      // Only trigger if actually moved more than a tiny amount
      if (moved > 2) {
        this.hasInteracted = true;
        this.mouse.x = newX / window.innerWidth;
        this.mouse.y = 1.0 - newY / window.innerHeight;

        // Accumulate intensity based on movement
        // Much slower buildup - need lots of movement to reach max
        const intensityGain = Math.min(moved * 0.002, 0.03); // Slower gain
        this.targetIntensity = Math.min(this.targetIntensity + intensityGain, this.maxIntensity);

        // Reset decay timeout - start decaying after movement stops
        clearTimeout(this.decayTimeout);
        this.decayTimeout = setTimeout(() => {
          this.targetIntensity = 0;
        }, 200);
      }
    });

    window.addEventListener('mouseleave', () => {
      // Start decay when mouse leaves
      this.targetIntensity = 0;
    });

    window.addEventListener('resize', () => this.resize());

    // Scroll tracking - also builds up intensity
    window.addEventListener('scroll', () => {
      const currentScrollY = window.scrollY;
      const scrollDelta = Math.abs(currentScrollY - this.lastScrollY);

      if (scrollDelta > 1) {
        this.hasInteracted = true;
        this.lastScrollY = currentScrollY;

        // Accumulate intensity based on scroll amount - slower buildup
        const intensityGain = Math.min(scrollDelta * 0.0015, 0.025);
        this.targetIntensity = Math.min(this.targetIntensity + intensityGain, this.maxIntensity);

        // Reset decay timeout
        clearTimeout(this.decayTimeout);
        this.decayTimeout = setTimeout(() => {
          this.targetIntensity = 0;
        }, 200);
      }
    });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        const newX = e.touches[0].clientX;
        const newY = e.touches[0].clientY;

        if (this.lastMouseX !== -1) {
          const dx = newX - this.lastMouseX;
          const dy = newY - this.lastMouseY;
          const moved = Math.sqrt(dx * dx + dy * dy);

          if (moved > 2) {
            const intensityGain = Math.min(moved * 0.002, 0.03);
            this.targetIntensity = Math.min(this.targetIntensity + intensityGain, this.maxIntensity);
          }
        }

        this.lastMouseX = newX;
        this.lastMouseY = newY;
        this.hasInteracted = true;
        this.mouse.x = newX / window.innerWidth;
        this.mouse.y = 1.0 - newY / window.innerHeight;

        clearTimeout(this.decayTimeout);
        this.decayTimeout = setTimeout(() => {
          this.targetIntensity = 0;
        }, 200);
      }
    });

    window.addEventListener('touchend', () => {
      this.targetIntensity = 0;
    });
  }

  render() {
    const gl = this.gl;

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);

    // Update uniforms
    gl.uniform2f(this.uResolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uTime, this.time);
    gl.uniform2f(this.uMouse, this.smoothMouse.x, this.smoothMouse.y);
    gl.uniform1f(this.uHoverIntensity, this.hoverIntensity);
    gl.uniform1f(this.uCellSize, this.cellSize * (window.devicePixelRatio || 1));
    gl.uniform1f(this.uIntensity, this.intensity);

    // Draw fullscreen quad
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.enableVertexAttribArray(this.aPosition);
    gl.vertexAttribPointer(this.aPosition, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  animate() {
    this.time += 0.016;

    // Smooth mouse tracking
    this.smoothMouse.x += (this.mouse.x - this.smoothMouse.x) * 0.08;
    this.smoothMouse.y += (this.mouse.y - this.smoothMouse.y) * 0.08;

    // Smooth intensity interpolation
    // Fast build-up, slower decay for smooth fade
    const intensitySpeed = this.targetIntensity > this.intensity ? 0.15 : 0.04;
    this.intensity += (this.targetIntensity - this.intensity) * intensitySpeed;

    // Clamp to fully off when very low
    if (this.intensity < 0.001) {
      this.intensity = 0;
    }

    this.render();
    requestAnimationFrame(() => this.animate());
  }
}

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new ASCIIBackground());
} else {
  new ASCIIBackground();
}

export default ASCIIBackground;
