const $ = (id) => document.getElementById(id);

// Application State
let currentCoords = { latitude: 13.0827, longitude: 80.2707 };
let currentPlaceName = 'Chennai, Tamil Nadu, India';
let cachedWeather = null;
let cachedAir = null;
let refreshTimer = null;

// Feature 2 State (7-Day Forecast)
let selectedDayIndex = 0;

// Feature 3 State (City Comparison)
let targetComparisonCity = 'Tokyo';
let targetComparisonCoords = { latitude: 35.6762, longitude: 139.6503 };

// Utility Functions
function setStatus(message, isError = false) {
  const el = $('statusMessage');
  if (el) {
    el.textContent = message;
    el.style.color = isError ? '#ff708f' : '';
  }
}

function formatHour(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric' });
}

function getWeatherIcon(code, isDay = 1) {
  if (code === 0) return isDay ? '☀' : '☾';
  if (code === 1 || code === 2) return isDay ? '⛅' : '☁';
  if (code === 3) return '☁';
  if (code >= 45 && code <= 48) return '≡'; // Fog
  if (code >= 51 && code <= 67) return '☂'; // Rain
  if (code >= 71 && code <= 77) return '❄'; // Snow
  if (code >= 80 && code <= 82) return '🌧'; // Showers
  if (code >= 95) return '⚡'; // Thunderstorm
  return '◌';
}

function getAqiLabel(aqi) {
  if (aqi <= 20) return ['Good', 'Great conditions for outdoor activities.'];
  if (aqi <= 40) return ['Fair', 'Air quality is acceptable for most people.'];
  if (aqi <= 60) return ['Moderate', 'Sensitive people should consider shorter outdoor activity.'];
  if (aqi <= 80) return ['Poor', 'Reduce long or intense outdoor exercise.'];
  if (aqi <= 100) return ['Very poor', 'Limit outdoor exposure if you feel discomfort.'];
  return ['Extremely poor', 'Avoid strenuous outdoor activity and check local guidance.'];
}

function setBar(id, value, max) {
  const el = $(id);
  if (el) {
    el.style.width = `${Math.max(3, Math.min(100, (value / max) * 100))}%`;
  }
}

function makeRecommendation(icon, title, detail) {
  return `<div class="recommendation"><span class="rec-icon">${icon}</span><div><strong>${title}</strong><p>${detail}</p></div></div>`;
}

function buildRecommendations(temp, aqi, uv, wind, rain) {
  const items = [];
  if (temp >= 35) items.push(makeRecommendation('☀', 'Heat alert', 'It is hot outside. Carry water, seek shade, and avoid intense activity during peak afternoon heat.'));
  else if (temp <= 18) items.push(makeRecommendation('◈', 'Cool conditions', 'Consider a light layer if you plan to stay outdoors for a long time.'));
  else items.push(makeRecommendation('✓', 'Temperature check', 'Temperature is not in an extreme range. Adjust clothing to your comfort.'));
  
  if (aqi > 60) items.push(makeRecommendation('◌', 'Protect your breathing', 'Air quality is elevated. Prefer indoor exercise and reduce prolonged outdoor exertion.'));
  else items.push(makeRecommendation('◎', 'Air quality outlook', 'Air quality is currently within a lower-risk range on the reported AQI scale.'));
  
  if (uv >= 6) items.push(makeRecommendation('☂', 'Sun protection needed', 'UV is high. Use shade, sunscreen, and protective clothing when outside.'));
  else if (uv >= 3) items.push(makeRecommendation('◉', 'Moderate sun exposure', 'Consider sun protection if you will be outdoors for an extended period.'));
  else items.push(makeRecommendation('✦', 'Low UV right now', 'UV exposure is currently low. Check again later because it changes throughout the day.'));
  
  if (rain >= 40) items.push(makeRecommendation('☂', 'Rain may affect plans', `Forecast precipitation probability is ${Math.round(rain)}%. Consider carrying an umbrella.`));
  else if (wind >= 35) items.push(makeRecommendation('〰', 'Windy conditions', 'Secure loose items and take care around exposed areas.'));
  else items.push(makeRecommendation('↗', 'Activity idea', 'A walk or outdoor break may be reasonable if local conditions feel comfortable.'));
  
  $('recommendations').innerHTML = items.slice(0, 4).join('');
}

// Geocoding helper
async function geocodeCity(city) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not search for that location.');
  const data = await response.json();
  if (!data.results?.length) throw new Error(`Location "${city}" not found. Try another city name.`);
  const place = data.results[0];
  return { 
    latitude: place.latitude, 
    longitude: place.longitude, 
    name: [place.name, place.admin1, place.country].filter((v, i, a) => v && a.indexOf(v) === i).join(', ') 
  };
}

// Core Data Loader
async function loadData(coords, placeName) {
  clearTimeout(refreshTimer);
  setStatus('Loading latest weather and air-quality data…');
  $('searchBtn').disabled = true;

  try {
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max,precipitation_probability_max&forecast_days=7&timezone=auto`;
    const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${coords.latitude}&longitude=${coords.longitude}&current=european_aqi,pm2_5,pm10&timezone=auto`;

    const [weatherRes, airRes] = await Promise.all([fetch(weatherUrl), fetch(airUrl)]);
    if (!weatherRes.ok || !airRes.ok) throw new Error('Live data is temporarily unavailable. Please try again.');

    const [weather, air] = await Promise.all([weatherRes.json(), airRes.json()]);
    if (!weather.current) throw new Error('No current weather data was returned.');

    currentCoords = coords;
    currentPlaceName = placeName || 'Selected location';
    cachedWeather = weather;
    cachedAir = air;

    const c = weather.current;
    const aqi = air.current?.european_aqi ?? 0;
    const uv = weather.hourly?.uv_index?.[Math.max(0, weather.hourly.time.indexOf(c.time))] ?? weather.daily?.uv_index_max?.[0] ?? 0;
    const wind = c.wind_speed_10m ?? 0;
    const temp = c.temperature_2m ?? 0;
    const rain = weather.hourly?.precipitation_probability?.[Math.max(0, weather.hourly.time.indexOf(c.time))] ?? 0;

    // Main snapshot
    $('placeName').textContent = currentPlaceName;
    $('localDate').textContent = `${new Date(c.time).toLocaleString([], { weekday:'long', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })} · ${c.relative_humidity_2m ?? '--'}% humidity`;
    $('temperature').textContent = Math.round(temp);
    $('feelsLike').textContent = `Feels like ${Math.round(c.apparent_temperature ?? temp)}°C`;
    $('aqi').textContent = air.current?.european_aqi ?? 'N/A';
    
    const [aqiLabel] = getAqiLabel(aqi);
    $('aqiLabel').textContent = aqiLabel;
    $('wind').textContent = Math.round(wind);
    $('windLabel').textContent = wind >= 30 ? 'Strong breeze' : wind >= 15 ? 'Moderate breeze' : 'Light wind';
    $('uv').textContent = Number(uv).toFixed(1);
    $('uvLabel').textContent = uv >= 6 ? 'High exposure' : uv >= 3 ? 'Moderate exposure' : 'Low exposure';

    setBar('tempBar', temp, 45); 
    setBar('aqiBar', aqi, 100); 
    setBar('windBar', wind, 60); 
    setBar('uvBar', uv, 11);

    const risk = (temp >= 38 || aqi > 80 || uv >= 8) 
      ? 'Take extra precautions' 
      : (temp >= 35 || aqi > 60 || uv >= 6) 
      ? 'Use some precautions' 
      : 'Conditions look manageable';

    $('decisionPill').innerHTML = `<span>●</span> ${risk}`;
    $('decisionPill').style.borderColor = (risk === 'Take extra precautions') ? 'rgba(255,130,130,.5)' : 'rgba(99,242,194,.25)';

    // Render 12-hour timeline and recommendations
    renderHourly(weather);
    buildRecommendations(temp, aqi, uv, wind, rain);

    // Render the 3 Extra Features
    renderFeature1Activities(temp, aqi, uv, wind);
    renderFeature2SevenDayForecast(weather);
    renderFeature3Comparison(currentPlaceName, temp, aqi, c.relative_humidity_2m, wind);

    $('updatedAt').textContent = `Updated ${new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}`;
    setStatus('Data loaded successfully. Auto-refreshes every 10 minutes.');
    refreshTimer = setTimeout(() => loadData(currentCoords, currentPlaceName), 10 * 60 * 1000);
  } catch (error) {
    setStatus(error.message || 'Something went wrong. Check your internet connection.', true);
  } finally {
    $('searchBtn').disabled = false;
  }
}

function renderHourly(weather) {
  const times = weather.hourly?.time || [];
  const temps = weather.hourly?.temperature_2m || [];
  const rain = weather.hourly?.precipitation_probability || [];
  const codes = weather.hourly?.weather_code || [];
  const now = new Date(weather.current.time).getTime();
  let start = times.findIndex(t => new Date(t).getTime() >= now);
  if (start < 0) start = 0;

  const items = [];
  for (let i = start; i < Math.min(start + 6, times.length); i++) {
    const isNow = i === start;
    const hourLabel = isNow ? 'Now' : formatHour(times[i]);
    const icon = getWeatherIcon(codes[i] ?? 0);
    items.push(`
      <div class="hour-item">
        <div class="hour-time">${hourLabel}</div>
        <div class="hour-symbol">${icon}</div>
        <div class="hour-temp">${Math.round(temps[i] ?? 0)}°</div>
        <div class="hour-rain">☂ ${rain[i] ?? 0}%</div>
      </div>
    `);
  }
  $('hourlyForecast').innerHTML = items.join('') || '<p class="muted">Hourly forecast is unavailable.</p>';
}

// ==============================================
// FEATURE 1: OUTDOOR ACTIVITY & SAFETY SUITE
// ==============================================
function renderFeature1Activities(temp, aqi, uv, wind) {
  // 1. Running & Cardio
  const runOptimal = temp <= 27 && aqi <= 45 && uv <= 6;
  const runFair = temp <= 33 && aqi <= 65;
  const runStatus = runOptimal ? 'Optimal' : runFair ? 'Moderate' : 'Caution';
  $('badgeRunning').textContent = runStatus;
  $('badgeRunning').className = `act-badge ${runOptimal ? 'badge-optimal' : runFair ? 'badge-fair' : 'badge-caution'}`;
  $('tipRunning').textContent = runOptimal 
    ? 'Air density and thermal balance are in an ideal range for cardio endurance.' 
    : runFair ? 'Stay hydrated. Exercise at a moderate pace with adequate water breaks.' 
    : 'High thermal or particulate load. Prefer early morning or indoor workout.';

  // 2. Cycling & Commuting
  const cycOptimal = wind <= 25 && temp <= 34;
  const cycStatus = cycOptimal ? 'Good' : 'Windy / Alert';
  $('badgeCycling').textContent = cycStatus;
  $('badgeCycling').className = `act-badge ${cycOptimal ? 'badge-optimal' : 'badge-fair'}`;
  $('tipCycling').textContent = cycOptimal
    ? 'Manageable wind speeds and clear roadway conditions expected.'
    : 'Strong wind gusts detected. Watch for sudden crosswinds at open road sections.';

  // 3. Pet Walking & Paw Heat (asphalt heating formula)
  const asphaltTemp = Math.round(temp * 1.5);
  const petSafe = temp < 27;
  const petStatus = petSafe ? 'Paw Safe' : temp < 32 ? 'Paw Check' : 'Pavement Hot';
  $('badgePet').textContent = petStatus;
  $('badgePet').className = `act-badge ${petSafe ? 'badge-optimal' : temp < 32 ? 'badge-fair' : 'badge-caution'}`;
  $('tipPet').textContent = `Estimated pavement temp is ~${asphaltTemp}°C. ${petSafe ? 'Safe for outdoor dog walks.' : 'Test asphalt with the back of your hand for 7 seconds before walks.'}`;

  // 4. Kids & Seniors
  const kidSafe = aqi <= 40 && temp <= 32 && uv <= 6;
  const kidStatus = kidSafe ? 'Safe' : 'Precautions';
  $('badgeSensitive').textContent = kidStatus;
  $('badgeSensitive').className = `act-badge ${kidSafe ? 'badge-optimal' : 'badge-caution'}`;
  $('tipSensitive').textContent = kidSafe
    ? 'Low particulate exposure. Great atmosphere for parks and playgrounds.'
    : 'Sensitive respiratory groups should reduce prolonged outdoor exertion.';
}

// ==============================================
// FEATURE 2: 7-DAY PRECISION EXTENDED FORECAST
// ==============================================
function renderFeature2SevenDayForecast(weather) {
  const daily = weather.daily || {};
  const times = daily.time || [];
  const maxTemps = daily.temperature_2m_max || [];
  const minTemps = daily.temperature_2m_min || [];
  const rainMax = daily.precipitation_probability_max || [];
  const uvMax = daily.uv_index_max || [];
  const codes = daily.weather_code || [];

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const cards = [];

  for (let i = 0; i < Math.min(7, times.length); i++) {
    const d = new Date(times[i]);
    const dayLabel = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : days[d.getDay()];
    const dateLabel = `${d.getDate()} ${d.toLocaleString([], { month: 'short' })}`;
    const icon = getWeatherIcon(codes[i] ?? 0);
    const max = Math.round(maxTemps[i] ?? 0);
    const min = Math.round(minTemps[i] ?? 0);
    const rain = rainMax[i] ?? 0;
    const isSelected = i === selectedDayIndex;

    cards.push(`
      <div class="day-card ${isSelected ? 'selected' : ''}" data-day-index="${i}">
        <div class="day-name">${dayLabel}</div>
        <div class="day-date">${dateLabel}</div>
        <div class="day-icon">${icon}</div>
        <div class="day-temps">${max}°<small>/${min}°</small></div>
        <div class="day-rain">☂ ${rain}%</div>
      </div>
    `);
  }

  $('forecast7DayGrid').innerHTML = cards.join('');

  // Attach click listener to each day card
  document.querySelectorAll('.day-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.getAttribute('data-day-index'), 10);
      selectedDayIndex = idx;
      document.querySelectorAll('.day-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      updateDayDetailBanner(idx, daily, days);
    });
  });

  // Update initial day banner
  updateDayDetailBanner(selectedDayIndex, daily, days);
}

function updateDayDetailBanner(index, daily, days) {
  const times = daily.time || [];
  if (!times[index]) return;

  const d = new Date(times[index]);
  const dayLabel = index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : days[d.getDay()];
  const dateFormatted = `${dayLabel}, ${d.getDate()} ${d.toLocaleString([], { month: 'long' })}`;
  const max = Math.round(daily.temperature_2m_max?.[index] ?? 0);
  const min = Math.round(daily.temperature_2m_min?.[index] ?? 0);
  const rain = daily.precipitation_probability_max?.[index] ?? 0;
  const uv = Number(daily.uv_index_max?.[index] ?? 0).toFixed(1);

  $('bannerDayTitle').textContent = `${dateFormatted} — Projected Conditions`;
  $('bannerDayText').textContent = `Expected precipitation probability is ${rain}%, with peak UV index reaching ${uv}. Ideal day for ${rain >= 50 ? 'indoor activities and keeping an umbrella' : 'outdoor errands and excursions'}.`;
  $('bannerDayStats').textContent = `High: ${max}°C · Low: ${min}°C · UV: ${uv}`;
}

// ==============================================
// FEATURE 3: LIVE CITY COMPARISON
// ==============================================
function renderFeature3Comparison(activeCityName, temp, aqi, humidity, wind) {
  // Update Active City card
  $('compCurrentTitle').textContent = activeCityName.split(',')[0];
  $('compCurrentTemp').textContent = `${Math.round(temp)}°C`;
  $('compCurrentAQI').textContent = `${aqi} AQI`;
  $('compCurrentHumidity').textContent = `${humidity ?? '--'}%`;
  $('compCurrentWind').textContent = `${Math.round(wind)} km/h`;

  // Load benchmark comparison city
  loadComparisonBenchmark(targetComparisonCity);
}

async function loadComparisonBenchmark(cityName) {
  targetComparisonCity = cityName;
  $('compTargetTitle').textContent = `${cityName} (Loading…)`;

  try {
    const place = await geocodeCity(cityName);
    targetComparisonCoords = place;

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m&timezone=auto`;
    const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${place.latitude}&longitude=${place.longitude}&current=european_aqi&timezone=auto`;

    const [wRes, aRes] = await Promise.all([fetch(weatherUrl), fetch(airUrl)]);
    const [w, a] = await Promise.all([wRes.json(), aRes.json()]);

    const temp = Math.round(w.current?.temperature_2m ?? 20);
    const hum = w.current?.relative_humidity_2m ?? 50;
    const wind = Math.round(w.current?.wind_speed_10m ?? 10);
    const aqi = a.current?.european_aqi ?? 'N/A';

    $('compTargetTitle').textContent = place.name.split(',')[0];
    $('compTargetTemp').textContent = `${temp}°C`;
    $('compTargetAQI').textContent = `${aqi} AQI`;
    $('compTargetHumidity').textContent = `${hum}%`;
    $('compTargetWind').textContent = `${wind} km/h`;
  } catch {
    $('compTargetTitle').textContent = `${cityName} (Offline)`;
    $('compTargetTemp').textContent = '--';
    $('compTargetAQI').textContent = '--';
    $('compTargetHumidity').textContent = '--';
    $('compTargetWind').textContent = '--';
  }
}

// ==============================================
// INTERACTIVE EVENT LISTENERS (ALL BUTTONS WORK)
// ==============================================
function setupEventListeners() {
  // 1. Search button
  const handleSearch = () => {
    const city = $('cityInput').value.trim();
    if (!city) { setStatus('Enter a city name first.', true); return; }
    setStatus('Finding location…');
    geocodeCity(city)
      .then(place => loadData(place, place.name))
      .catch(err => setStatus(err.message, true));
  };
  $('searchBtn').addEventListener('click', handleSearch);
  $('cityInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSearch(); });

  // 2. Geolocation button
  $('locationBtn').addEventListener('click', () => {
    if (!navigator.geolocation) {
      setStatus('Geolocation is not supported by your browser.', true);
      return;
    }
    setStatus('Requesting your location permission…');
    navigator.geolocation.getCurrentPosition(async position => {
      const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      try {
        const response = await fetch(`https://geocoding-api.open-meteo.com/v1/reverse?latitude=${coords.latitude}&longitude=${coords.longitude}&language=en&format=json`);
        const data = await response.json();
        const result = data.results?.[0];
        const name = result ? [result.name, result.admin1, result.country].filter(Boolean).join(', ') : 'Your location';
        $('cityInput').value = result?.name || '';
        loadData(coords, name);
      } catch {
        loadData(coords, 'Your location');
      }
    }, error => {
      setStatus(error.code === 1 ? 'Location permission was denied. Search for a city instead.' : 'Could not get your location. Search for a city instead.', true);
    }, { timeout: 10000 });
  });

  // 3. Refresh live data button
  $('refreshBtn').addEventListener('click', () => {
    loadData(currentCoords, currentPlaceName);
  });

  // 4. Feature 1: Filter pill buttons
  document.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.getAttribute('data-filter');
      
      document.querySelectorAll('.activity-card').forEach(card => {
        const cat = card.getAttribute('data-category');
        if (filter === 'all' || cat === filter) {
          card.classList.remove('dimmed');
        } else {
          card.classList.add('dimmed');
        }
      });
    });
  });

  // 5. Feature 3: Comparison City Chips
  document.querySelectorAll('.comp-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.comp-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      loadComparisonBenchmark(chip.getAttribute('data-city'));
    });
  });

  // 6. Feature 3: Custom Comparison Search
  const handleCompSearch = () => {
    const val = $('compCustomInput').value.trim();
    if (!val) return;
    document.querySelectorAll('.comp-chip').forEach(c => c.classList.remove('active'));
    loadComparisonBenchmark(val);
  };
  $('compSearchBtn').addEventListener('click', handleCompSearch);
  $('compCustomInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleCompSearch(); });

  // 7. Feature 3: Swap Button (Set benchmark city as main dashboard location)
  $('compSwapBtn').addEventListener('click', () => {
    if (targetComparisonCoords) {
      $('cityInput').value = targetComparisonCity;
      loadData(targetComparisonCoords, targetComparisonCoords.name || targetComparisonCity);
      // Smooth scroll back to top to view new data
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
}

// Live Corner Clock Feature
let is24HourClock = false;
let clockTimer = null;

function updateDashboardClock() {
  const digitsEl = $('clockDigits');
  const periodEl = $('clockPeriod');
  const dateEl = $('clockDate');
  const tzEl = $('clockTz');

  if (!digitsEl || !dateEl) return;

  const now = new Date();

  if (is24HourClock) {
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    digitsEl.textContent = `${hours}:${minutes}:${seconds}`;
    if (periodEl) {
      periodEl.textContent = '24H';
      periodEl.style.display = 'inline';
    }
  } else {
    let hours = now.getHours();
    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const hoursStr = String(hours).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    digitsEl.textContent = `${hoursStr}:${minutes}:${seconds}`;
    if (periodEl) {
      periodEl.textContent = period;
      periodEl.style.display = 'inline';
    }
  }

  const dateOptions = { weekday: 'short', month: 'short', day: 'numeric' };
  dateEl.textContent = now.toLocaleDateString([], dateOptions);

  if (tzEl) {
    try {
      const parts = new Intl.DateTimeFormat([], { timeZoneName: 'short' }).formatToParts(now);
      const tzPart = parts.find((p) => p.type === 'timeZoneName');
      tzEl.textContent = tzPart ? tzPart.value : 'LOCAL';
    } catch {
      tzEl.textContent = 'LOCAL';
    }
  }
}

function initDashboardClock() {
  const clockCard = $('dashboardClock');
  if (clockCard) {
    clockCard.addEventListener('click', () => {
      is24HourClock = !is24HourClock;
      updateDashboardClock();
    });
  }

  updateDashboardClock();
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(updateDashboardClock, 1000);
}

// Initial Boot
initDashboardClock();
setupEventListeners();
loadData(currentCoords, currentPlaceName);
