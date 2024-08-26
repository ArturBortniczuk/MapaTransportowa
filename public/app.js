// Inicjalizacja mapy
const map = L.map('map').setView([52.0, 19.0], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Referencja do bazy danych Firebase
const database = firebase.database();

// Pobieranie elementów DOM
const addPinButton = document.getElementById('addPinButton');
const legendButton = document.getElementById('legendButton');
const closeLegendButton = document.getElementById('closeLegendButton');
const addPinPanel = document.getElementById('addPinPanel');
const legendPanel = document.getElementById('legendPanel');
const addPinForm = document.getElementById('addPinForm');
const fillLevelSlider = document.getElementById('fillLevel');
const fillLevelValue = document.getElementById('fillLevelValue');

let markers = {};

// Obsługa przycisków i paneli
addPinButton.addEventListener('click', () => {
    addPinPanel.classList.toggle('visible');
    addPinButton.classList.toggle('panel-visible');
    addPinButton.textContent = addPinPanel.classList.contains('visible') ? '❌ Zamknij' : '➕ Dodaj pinezkę';
    if (legendPanel.classList.contains('visible')) {
        closeLegend();
    }
});

legendButton.addEventListener('click', () => {
    legendPanel.classList.add('visible');
    closeLegendButton.classList.add('visible');
    legendButton.style.display = 'none';
    if (addPinPanel.classList.contains('visible')) {
        addPinPanel.classList.remove('visible');
        addPinButton.classList.remove('panel-visible');
        addPinButton.textContent = '➕ Dodaj pinezkę';
    }
});

closeLegendButton.addEventListener('click', closeLegend);

function closeLegend() {
    legendPanel.classList.remove('visible');
    closeLegendButton.classList.remove('visible');
    legendButton.style.display = 'block';
}

fillLevelSlider.addEventListener('input', (e) => {
    fillLevelValue.textContent = e.target.value;
});

// Obsługa formularza dodawania pinezki
addPinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('pinName').value;
    const address = document.getElementById('pinAddress').value;
    const cargo = document.getElementById('pinCargo').value;
    const carType = document.getElementById('carType').value;
    const fillLevel = document.getElementById('fillLevel').value;
    const dayOfWeek = document.getElementById('dayOfWeek').value;

    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
        const data = await response.json();
        if (data.length > 0) {
            const { lat, lon } = data[0];
            const city = data[0].display_name.split(',')[0];
            await addMarker(lat, lon, name, cargo, carType, fillLevel, city, dayOfWeek);
            addPinPanel.classList.remove('visible');
            addPinButton.classList.remove('panel-visible');
            addPinButton.textContent = '➕ Dodaj pinezkę';
            addPinForm.reset();
            fillLevelValue.textContent = '3';
        } else {
            alert('Nie udało się znaleźć podanego adresu.');
        }
    } catch (error) {
        console.error('Błąd podczas geokodowania:', error);
        alert('Wystąpił błąd podczas dodawania pinezki.');
    }
});

// Funkcja dodawania markera
async function addMarker(lat, lon, name, cargo, carType, fillLevel, city, dayOfWeek, id = null) {
    const carTypeMap = {
        'blaszak_bialystok': 'blaszak',
        'blaszak_zielonka': 'blaszak',
        'firanka_bialystok': 'firanka',
        'firanka_zielonka': 'firanka',
        'man_stary_bialystok': 'man',
        'man_nowy_bialystok': 'man',
        'man_zielonka': 'man'
    };

    const polishDayNames = {
        'monday': 'Poniedziałek',
        'tuesday': 'Wtorek',
        'wednesday': 'Środa',
        'thursday': 'Czwartek',
        'friday': 'Piątek'
    };

    const iconType = carTypeMap[carType];
    const iconUrl = `static/${iconType}_${fillLevel}_${dayOfWeek}.png`;
    
    console.log('Próba załadowania ikony:', iconUrl);
    
    const icon = L.icon({
        iconUrl: iconUrl,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
    });
    
    const marker = L.marker([lat, lon], { icon: icon, day: dayOfWeek }).addTo(map);
    
    if (!id) {
        // Dodaj marker do Firebase
        const newMarkerRef = database.ref('markers').push();
        id = newMarkerRef.key;
        await newMarkerRef.set({
            lat, lon, name, cargo, carType, fillLevel, city, dayOfWeek
        });
    }

    markers[id] = marker;

    const popupContent = `
        <b>${name}</b><br>
        Miasto: ${city}<br>
        Auto: ${carType.replace(/_/g, ' ')}<br>
        Dzień: ${polishDayNames[dayOfWeek]}<br>
        Towar: ${cargo}<br>
        Zapełnienie: ${fillLevel}/5<br>
        <button class="delete-button" onclick="deleteMarker('${id}')">Usuń pinezkę</button>
    `;
    marker.bindPopup(popupContent);

    filterMarkers();
}

// Funkcja usuwania markera
async function deleteMarker(markerId) {
    if (markers[markerId]) {
        map.removeLayer(markers[markerId]);
        delete markers[markerId];
        // Usuń marker z Firebase
        await database.ref('markers/' + markerId).remove();
        filterMarkers();
    }
}

// Funkcja wczytywania markerów
function loadMarkers() {
    database.ref('markers').on('value', (snapshot) => {
        // Wyczyść istniejące markery
        Object.values(markers).forEach(marker => map.removeLayer(marker));
        markers = {};

        const data = snapshot.val();
        if (data) {
            Object.entries(data).forEach(([id, markerData]) => {
                addMarker(
                    markerData.lat,
                    markerData.lon,
                    markerData.name,
                    markerData.cargo,
                    markerData.carType,
                    markerData.fillLevel,
                    markerData.city,
                    markerData.dayOfWeek,
                    id
                );
            });
        }
        filterMarkers();
    });
}

// Funkcja filtrowania markerów
function filterMarkers() {
    const activeDays = Array.from(document.querySelectorAll('.legend-item:not(.inactive)'))
        .map(item => item.dataset.day);

    Object.values(markers).forEach(marker => {
        const markerDay = marker.options.day;
        if (activeDays.includes(markerDay)) {
            if (!map.hasLayer(marker)) {
                map.addLayer(marker);
            }
        } else {
            if (map.hasLayer(marker)) {
                map.removeLayer(marker);
            }
        }
    });
}

// Obsługa kliknięć w elementy legendy
document.querySelectorAll('.legend-item').forEach(item => {
    item.addEventListener('click', () => {
        item.classList.toggle('inactive');
        filterMarkers();
    });
});

// Eksport funkcji deleteMarker do globalnego obiektu window
window.deleteMarker = deleteMarker;

// Wczytanie markerów przy starcie
loadMarkers();

// Obsługa zmiany rozmiaru okna
window.addEventListener('resize', () => {
    map.invalidateSize();
});