function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

const map = L.map('map').setView([52.0, 19.0], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

const database = firebase.database();
const addPinButton = document.getElementById('addPinButton');
const legendButton = document.getElementById('legendButton');
const closeLegendButton = document.getElementById('closeLegendButton');
const addPinPanel = document.getElementById('addPinPanel');
const legendPanel = document.getElementById('legendPanel');
const addPinForm = document.getElementById('addPinForm');
const fillLevelSlider = document.getElementById('fillLevel');
const fillLevelValue = document.getElementById('fillLevelValue');

let markers = {};

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

const addMarker = debounce(async function(lat, lon, name, cargo, carType, fillLevel, city, dayOfWeek) {
    // Sprawdź, czy marker o tych współrzędnych już istnieje
    const snapshot = await database.ref('markers').orderByChild('lat').equalTo(lat).once('value');
    let existingMarker = null;
    snapshot.forEach((childSnapshot) => {
        const markerData = childSnapshot.val();
        if (markerData.lon === lon && markerData.active) {
            existingMarker = { key: childSnapshot.key, ...markerData };
            return true; // Przerywa pętlę forEach
        }
    });

    let markerId;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, ''); // Format: YYYYMMDD

    // Pobierz aktualny licznik dla danego dnia
    const counterRef = database.ref('counters/' + dateStr);
    const counterSnapshot = await counterRef.once('value');
    let counter = counterSnapshot.val() || 0;
    counter++;

    // Utwórz nową nazwę rekordu
    const newRecordName = `${dateStr}-${counter.toString().padStart(3, '0')}`;

    if (existingMarker) {
        // Marker już istnieje, zaktualizuj go
        markerId = existingMarker.key;
        await database.ref('markers/' + markerId).update({
            name, cargo, carType, fillLevel, city, dayOfWeek,
            recordName: newRecordName,
            active: true
        });
        console.log('Marker zaktualizowany:', markerId);
    } else {
        // Dodaj nowy marker
        const newMarkerRef = database.ref('markers').push();
        markerId = newMarkerRef.key;
        await newMarkerRef.set({
            lat, lon, name, cargo, carType, fillLevel, city, dayOfWeek,
            recordName: newRecordName,
            active: true
        });
        console.log('Nowy marker dodany:', markerId);
    }

    // Zaktualizuj licznik
    await counterRef.set(counter);

    refreshMarkers();
}, 300);

async function deleteMarker(markerId) {
    if (markers[markerId]) {
        map.removeLayer(markers[markerId]);
        delete markers[markerId];
        // Zamiast usuwać, ustawiamy flagę active na false
        await database.ref('markers/' + markerId).update({ active: false });
        console.log('Marker oznaczony jako nieaktywny:', markerId);
    }
}

function loadMarkers() {
    database.ref('markers').orderByChild('active').equalTo(true).once('value', (snapshot) => {
        // Wyczyść istniejące markery
        Object.values(markers).forEach(marker => map.removeLayer(marker));
        markers = {};

        snapshot.forEach((childSnapshot) => {
            const markerId = childSnapshot.key;
            const markerData = childSnapshot.val();
            const { lat, lon, name, cargo, carType, fillLevel, city, dayOfWeek, recordName } = markerData;

            const iconType = carTypeMap[carType];
            const iconUrl = `static/${iconType}_${fillLevel}_${dayOfWeek}.png`;
            
            const icon = L.icon({
                iconUrl: iconUrl,
                iconSize: [32, 32],
                iconAnchor: [16, 32],
                popupAnchor: [0, -32]
            });

            const marker = L.marker([lat, lon], { icon: icon, day: dayOfWeek }).addTo(map);
            markers[markerId] = marker;

            const popupContent = `
                <b>${name}</b><br>
                Numer rekordu: ${recordName}<br>
                Miasto: ${city}<br>
                Auto: ${carType.replace(/_/g, ' ')}<br>
                Dzień: ${polishDayNames[dayOfWeek]}<br>
                Towar: ${cargo}<br>
                Zapełnienie: ${fillLevel}/5<br>
                <button class="delete-button" onclick="deleteMarker('${markerId}')">Usuń pinezkę</button>
            `;
            marker.bindPopup(popupContent);
        });
        filterMarkers();
    });
}

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

document.querySelectorAll('.legend-item').forEach(item => {
    item.addEventListener('click', () => {
        item.classList.toggle('inactive');
        filterMarkers();
    });
});

async function initDailyCounter() {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const counterRef = database.ref('counters/' + dateStr);
    const counterSnapshot = await counterRef.once('value');
    if (!counterSnapshot.exists()) {
        await counterRef.set(0);
    }
}

function refreshMarkers() {
    loadMarkers();
}

window.deleteMarker = deleteMarker;

initDailyCounter();
loadMarkers();

window.addEventListener('resize', () => {
    map.invalidateSize();
});

// Dodaj przycisk do ręcznego odświeżania markerów
const refreshButton = document.createElement('button');
refreshButton.textContent = 'Odśwież markery';
refreshButton.onclick = refreshMarkers;
document.body.appendChild(refreshButton);