export interface Preset {
  name: string
  category: string
  body: string
}

export const DEFAULT_PRESET_NAME = 'Chromatic Aberration (Swapped)'

export const PRESETS: Preset[] = [
  {
    name: 'Texture Warp',
    category: 'Rolling Hills',
    body: `uv.x = uv.x + sin(time + uv.x * 30.0) * 0.02;
uv.y = uv.y + sin(time + uv.y * 30.0) * 0.02;

color = scene(uv);`,
  },
  {
    name: 'Chromatic Aberration',
    category: 'Rolling Hills',
    body: `float value = sin(time) * 0.04;
vec2 red_uv   = uv + vec2( 0.0,    1.0) * value;
vec2 green_uv = uv + vec2( 0.866, -0.5) * value;
vec2 blue_uv  = uv + vec2(-0.866, -0.5) * value;

color = vec3(
    scene(red_uv  ).x,
    scene(green_uv).y,
    scene(blue_uv ).z
);`,
  },
  {
    name: 'Chromatic Aberration (Swapped)',
    category: 'Rolling Hills',
    body: `float value = sin(time) * 0.04;
vec2 red_uv   = uv + vec2( 0.0,    1.0) * value;
vec2 green_uv = uv + vec2( 0.866, -0.5) * value;
vec2 blue_uv  = uv + vec2(-0.866, -0.5) * value;

color = vec3(
    scene(red_uv  ).z,
    scene(green_uv).y,
    scene(blue_uv ).x
);`,
  },
  {
    name: 'Rolling Hills (Full)',
    category: 'Rolling Hills',
    body: `uv.x = uv.x + sin(time + uv.x * 50.0) * 0.01;
uv.y = uv.y + sin(time + uv.y * 50.0) * 0.01;

float red = scene(uv).x;

float bucketed_red = floor(red / 0.05) * 0.05;
float random_value = random(vec2(bucketed_red));

vec3 rainbow_color = rainbow_gradient(random_value);

vec3 hsv = rgb2hsv(rainbow_color);
hsv.x = mod(hsv.x + time / 30.0, 1.0);

color = hsv2rgb(hsv);`,
  },

  {
    name: 'Sliding Texture',
    category: 'Kitchen Sink',
    body: `vec2 right = vec2(1.0, 0.0);
right = right * sin01(time);
color = scene(uv + right);`,
  },
  {
    name: 'Bounce',
    category: 'Kitchen Sink',
    body: `uv.y = uv.y - abs(sin(time));
color = scene(uv);`,
  },
  {
    name: 'Circle Mask',
    category: 'Kitchen Sink',
    body: `float dist = distance(uv, vec2(0.5, 0.5));
float radius = sin01(time) * 0.3;

float mask = float(radius < dist && dist < radius + 0.1);

color = mix(scene(uv), scene(-uv), mask);`,
  },
  {
    name: 'Random Square Mask',
    category: 'Kitchen Sink',
    body: `vec2 boxy_uv = uv;
boxy_uv.x = floor(uv.x / 0.02) * 0.02;
boxy_uv.y = floor(uv.y / 0.02) * 0.02;

float rand = random(boxy_uv);
rand = mod(rand + time, 1.0);
float mask = float(rand < 0.5);

color = mix(
    scene(uv),
    scene(uv - 0.01),
    mask
);`,
  },
  {
    name: 'Star Wars Wipe',
    category: 'Kitchen Sink',
    body: `float y_step = uv.y;
y_step = mod(y_step + time / 10.0, 1.0);
y_step = floor(y_step / 0.1) * 0.1;

float mask = float(uv.x < y_step);

color = mix(
    scene( uv),
    scene(-uv),
    mask
);`,
  },
  {
    name: 'Horizontal Bars Mask',
    category: 'Kitchen Sink',
    body: `float threshold = uv.y;
threshold = threshold + time / 30.0;
threshold = threshold + sin01(uv.x * 200.0) * 0.03;

float size = 0.05;
threshold = mod(threshold, size);

float mask = float(threshold < size / 2.0);

color = mix(
    scene(uv),
    scene(uv + vec2(0.0, 0.01)),
    mask
);`,
  },
  {
    name: 'Min Blend',
    category: 'Kitchen Sink',
    body: `float delta = sin(time / 5.0);
vec3 p1 = scene(uv + delta);
vec3 p2 = scene(uv - delta);

color = min(p1, p2);`,
  },
  {
    name: 'Clamp Stretch',
    category: 'Kitchen Sink',
    body: `uv.x = clamp(uv.x, 0.2, 0.8);
uv.x = uv.x + time / 20.0;
color = scene(uv);`,
  },
  {
    name: 'Remap Zoom',
    category: 'Kitchen Sink',
    body: `float t = sin01(time);
float new_t = map_range(t, 0.0, 1.0, 1.0, 10.0);
color = scene(uv * new_t);`,
  },
  {
    name: 'Sin01ma Zoom',
    category: 'Kitchen Sink',
    body: `float period_secs = 2.0;
float offset_secs = 1.0;
float m = 3.0;
float a = 4.0;

float multiplier = sin01ma(
    time,
    period_secs,
    offset_secs,
    m,
    a
);

color = scene(uv * vec2(multiplier, multiplier));`,
  },
  {
    name: 'Layered Sin01ma',
    category: 'Kitchen Sink',
    body: `float m = 3.0;
float a = 4.0;

float multiplier_x = sin01ma(time, 2.05, 0.0, m, a);
float multiplier_y = sin01ma(time, 3.0,  0.1, m, a);

color = scene(uv * vec2(multiplier_x, multiplier_y));`,
  },
  {
    name: 'Stay01 Transition',
    category: 'Kitchen Sink',
    body: `float first = 1.0;
float second = 10.0;

float period_secs = 4.0;
float offset_secs = 0.0;
float strength = 5.0;

float transition01 = stay01(
    time,
    period_secs,
    offset_secs,
    strength
);

float multiplier = first + (second - first) * transition01;

color = scene(uv * vec2(multiplier, multiplier));`,
  },
  {
    name: 'Tiled Texture',
    category: 'Kitchen Sink',
    body: `uv = uv * 10.0;
color = scene(uv);`,
  },
  {
    name: 'Multiply Then Floor',
    category: 'Kitchen Sink',
    body: `uv = uv * 5.0;
uv = floor(uv / 0.1) * 0.1;

uv.x = uv.x + time;
color = scene(uv);`,
  },
  {
    name: 'Effect Then Grid',
    category: 'Kitchen Sink',
    body: `uv = mod(uv * 5.0, 1.0);
uv = uv + pow(uv.y, 5.0);

color = scene(uv + sin(time));`,
  },
  {
    name: 'Bulge',
    category: 'Kitchen Sink',
    body: `vec2 bulge_center = vec2(
    sin01(time),
    sin01(time)
);

float dist = distance(uv, bulge_center);
float displacement = pow(one_minus(dist), 4.0);
color = scene(uv + displacement);`,
  },
  {
    name: 'Pow Flatten',
    category: 'Kitchen Sink',
    body: `float exponent = sin01(time) * 5.0 + 1.0;
uv.y = uv.y + one_minus(pow(one_minus(uv.x), exponent));
color = scene(uv);`,
  },
  {
    name: 'Rotate Mask',
    category: 'Kitchen Sink',
    body: `float dist = distance(uv, vec2(0.5, 0.5));
float radius = 0.2;
float mask = float(radius < dist && dist < radius + 0.3);

uv = uv - vec2(0.5, 0.5);

color = mix(
    scene(rotate(uv,  time / 5.0) + vec2(0.5, 0.5)),
    scene(rotate(uv, -time / 5.0) + vec2(0.5, 0.5)),
    mask
);`,
  },
  {
    name: 'Circle SDF Warp',
    category: 'Kitchen Sink',
    body: `vec2 center = vec2(0.5, 0.5);
float size = sin01(time) / 2.0;
float dist = circle_sdf(uv, center, size);

color = scene(uv + vec2(dist, dist));`,
  },
  {
    name: 'Rect SDF Warp',
    category: 'Kitchen Sink',
    body: `vec2 center = vec2(0.5, 0.5);
float size = sin01(time) / 2.0;
float dist = rect_sdf(uv, center, vec2(size, size));
dist = dist * 5.0;

color = scene(uv + vec2(dist, dist));`,
  },
  {
    name: 'Polar Kaleidoscope',
    category: 'Kitchen Sink',
    body: `uv = uv - vec2(0.5, 0.5);
vec2 r_theta = xy_to_r_theta(uv);
float r     = r_theta.x;
float theta = r_theta.y;

float slices = 16.0;
float slice = 2.0 * PI / slices;

theta = mod(theta, slice);
theta = min(theta, slice - theta);
theta = theta + time;

vec2 new_r_theta = vec2(r, theta);
uv = r_theta_to_xy(new_r_theta);
uv = uv + vec2(0.5, 0.5);

color = scene(uv);`,
  },
  {
    name: 'Texture Self-Warp',
    category: 'Kitchen Sink',
    body: `color = scene(uv);
uv.x = uv.x + time / 30.0;

uv = uv + vec2(color.x, color.y);

color = scene(uv);
color = vec3(color.z, color.y, color.x);`,
  },
  {
    name: 'Rotating Overlap',
    category: 'Kitchen Sink',
    body: `vec2 center = vec2(
    sin01(time / 2.0),
    sin01(time / 2.1)
);

float dist = circle_sdf(uv, center, 0.7);
dist = max(0.0, dist);

dist = dist * 5.0;
uv = uv + vec2(dist, dist);

uv = rotate(uv, time / 20.0);

vec2 rotated_uv1 = vec2(uv.y,           uv.x);
vec2 rotated_uv2 = vec2(uv.y, one_minus(uv.x));

float first  = scene(rotated_uv1).x;
float second = scene(rotated_uv2).z;
float avg = (first + second) / 2.0;
color = vec3(avg, avg, avg);`,
  },

  // ── Noise ──

  {
    name: 'Noise UV Warp',
    category: 'Noise',
    body: `float top_left     = float(uv.x < 0.5  && 0.5  < uv.y);
float top_right    = float(0.5  < uv.x && 0.5  < uv.y);
float bottom_left  = float(uv.x < 0.5  && uv.y < 0.5);
float bottom_right = float(0.5  < uv.x && uv.y < 0.5);

float s     = simple_noise(uv * 100.0);
float vo    = voronoi_noise(uv * 10.0);
float pe    = perlin_noise(uv * 30.0);
float tu    = turbulence_noise(uv * 30.0, 5.0);

float noise =
    s  * top_left    +
    vo * top_right   +
    pe * bottom_left +
    tu * bottom_right;

uv = uv + noise * stay01(time, 10.0, 0.0, 3.0);

color = scene(uv);`,
  },
  {
    name: 'Random Jitter',
    category: 'Noise',
    body: `float exponent = sin01ma(time, 2.0 * PI, 0.0, 2.0, 7.0);
float size = pow(2.0, -exponent);
vec2 rounded = floor(uv / size) * size;
uv = uv + random(vec2(rounded)) * 0.02;

color = scene(uv);`,
  },
  {
    name: 'Dissolve',
    category: 'Noise',
    body: `vec3 a = scene(uv);
vec3 b = scene(-uv);

color = mix(a, b, float(random(uv) + sin(time) < uv.y));`,
  },
  {
    name: 'Grounded Jitter',
    category: 'Noise',
    body: `float high_framerate = floor(time / 0.05) * 0.05;
float low_framerate  = floor(time / 2.0 ) * 2.0;

float amt = 0.5;
vec2 high_jitter = white_noise2(vec2(high_framerate)) * amt;
vec2 low_jitter  = white_noise2(vec2(low_framerate))  * amt;

vec2 jitter_offset = mix(high_jitter, low_jitter, 0.98);

color = scene(uv + jitter_offset);`,
  },
  {
    name: 'Noise Circle Mask',
    category: 'Noise',
    body: `float noise_size = 30.0;
float noise = simple_noise(uv * noise_size);
float centered_noise = map_range(noise, 0.0, 1.0, -0.1, 0.1);

float dist = distance(uv + centered_noise, vec2(0.5, 0.5));
float radius = sin01(time) * 0.3;

float mask = float(radius < dist && dist < radius + 0.1);

color = mix(scene(uv), scene(-uv), mask);`,
  },
  {
    name: 'Perlin Paint',
    category: 'Noise',
    body: `vec2 boxy_uv = uv;

float noise = perlin_noise(uv * 10.0);
noise = map_range(noise, 0.0, 1.0, -0.1, 0.1);
boxy_uv = boxy_uv + noise;

boxy_uv = floor(boxy_uv / 0.02) * 0.02;

float rand = random(boxy_uv);
rand = mod(rand + time, 1.0);
float mask = float(rand < 0.5);

color = mix(
    scene(uv),
    scene(uv - 0.01),
    mask
);`,
  },
  {
    name: 'Perlin Glass',
    category: 'Noise',
    body: `float size = 0.005;
vec2 rounded = floor(uv / size) * size;

float slow_time = time / 3.0;
slow_time = floor(slow_time / 0.05) * 0.05;
float offset = random(uv + slow_time);
rounded = rounded + offset * 0.02;

float noise = perlin_noise(vec2(rounded) * 50.0);
noise = map_range(noise, 0.0, 1.0, -0.02, 0.02);

color = scene(uv + noise);`,
  },
  {
    name: 'Turbulence Fire',
    category: 'Noise',
    body: `float noise = turbulence_noise(uv * 30.0, 5.0);
float t = mod(time / 4.0, 1.0);

float fire_mask  = float(t < noise && noise < t + 0.1);
float black_mask = float(t + 0.1 < noise);

vec3 yellow = vec3(1.0, 1.0, 0.0);
vec3 orange = vec3(1.0, 0.3, 0.0);
float fire_t = map_range(noise, t, t + 0.1, 0.0, 1.0);
vec3 fire_color = mix(yellow, orange, fire_t);

color =
    scene(uv) * black_mask +
    fire_color * fire_mask;`,
  },

  // ── Color ──

  {
    name: 'Replace RGB',
    category: 'Color',
    body: `vec3 new_red   = vec3(0.0, 0.5, 0.5);
vec3 new_green = vec3(0.5, 0.0, 0.5);
vec3 new_blue  = vec3(0.5, 0.5, 0.0);

color = replace_rgb(
    scene(uv),
    new_red,
    new_green,
    new_blue
);`,
  },
  {
    name: 'HSV Hue Shift',
    category: 'Color',
    body: `vec3 rgb = scene(uv);
vec3 hsv = rgb2hsv(rgb);

float delta = sin(time / 3.0) * 0.5;
hsv.x = mod(hsv.x + rgb.x + delta, 1.0);
hsv.y = max(0.0, hsv.y - 0.2);
hsv.z = min(1.0, hsv.z + delta);

color = hsv2rgb(hsv);`,
  },
  {
    name: 'Palette',
    category: 'Color',
    body: `float red_channel = scene(uv).x;

color = palette(
    vec3(0.5,  0.5,          0.5),
    vec3(0.5,  0.5,          0.5),
    vec3(2.0,  sin01(time),  0.0),
    vec3(0.50, 0.20,         0.25),
    red_channel
);`,
  },

  // ── Gallery ──

  {
    name: 'Ray March Infinite Spheres',
    category: 'Gallery',
    body: `vec3 pos = vec3(0.0);
vec3 march_direction = vec3(uv.x - 0.5, uv.y - 0.5, 1.0);
float total_dist = 0.0;
for (int i = 0; i < 30; i++) {
    vec3 repeated_pos = vec3(pos.xy, pos.z + time / 4.0);
    repeated_pos = mod(repeated_pos, 0.6) - 0.3;

    float current_dist = sphere_sdf(repeated_pos, 0.25);
    pos = pos + march_direction * current_dist;
    total_dist = total_dist + current_dist;

    if (abs(current_dist) < 0.0001) break;
    if (5.0 <= total_dist) {
        total_dist = 0.0;
        break;
    }
}

color = scene(vec2(uv.x, total_dist));`,
  },
  {
    name: 'Sliding In',
    category: 'Gallery',
    body: `float size = 0.1;
float row = floor(uv.y / size) * size;

float prog_total = mod(time / 10.0, 1.0);

float prog_row = smoothstep(
    row,
    row + size,
    prog_total
);

float mask = float(uv.x < prog_row);
vec2 new_uv = uv;
new_uv.x = new_uv.x - prog_row;

color = mix(scene(new_uv), scene(-uv), mask);`,
  },
  {
    name: 'Sliding Squares',
    category: 'Gallery',
    body: `float prog_total = mod(time / 10.0, 1.0);

float toggle_size = float(prog_total < 0.5);
float size = mix(0.05, 0.1, toggle_size);

vec2 sq = floor(uv / size) * size;
float a = random(sq);
a = floor(a / size) * size;

float prog_square = smoothstep(
    a,
    a + size,
    prog_total
);

float mask_y = mix(sq.y, sq.y + size, prog_square);
float mask = float(uv.y < mask_y);
float offset = prog_square * size;

vec2 new_uv = vec2(uv.x, uv.y - offset);
color = mix(scene(new_uv), scene(-uv), mask);`,
  },
  {
    name: 'Wind Blow',
    category: 'Gallery',
    body: `vec2 uv2 = uv;
uv2.x = (uv2.x - 0.1) * 0.7 + 0.3;

float t2 = floor_to_nearest(time, 0.15);
float n1 = perlin_noise((uv2 +  t2 / 3.0 + 0.8) * 10.0);
float n2 = perlin_noise((uv2 -  t2 / 5.0 + 0.3) * 20.0);
float n3 = voronoi_noise((uv2 - t2 / 3.0 + 0.2) * 50.0);
float noise = one_minus(n1 * n2 * n3);

float blow_power = stay(time, 2.0, 4.0, 2.0, 0.0, 10.0);
uv2.x += pow(uv.y, blow_power) * noise * 0.8 - 0.8;

vec3 p1 = scene(uv);
vec3 p2 = scene(uv2);

color = vec3(
    p1.y,
    p2.x,
    p2.x
);`,
  },
]
