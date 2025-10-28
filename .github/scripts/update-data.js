// .github/scripts/update-data.js

const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "../../history.json");

// Функция для имитации получения новых данных
async function fetchData() {
  // ⚠️ Здесь поставь реальную ссылку на парсинг
  // или просто тестовые данные для проверки
  return {
    timestamp: new Date().toISOString(),
    avg10: (Math.random() * 5).toFixed(2),
    avg25: (Math.random() * 4).toFixed(2),
    avg50: (Math.random() * 3).toFixed(2),
  };
}

(async () => {
  console.log("⏳ Обновление данных CS2Run...");

  const newData = await fetchData();
  const newContent = JSON.stringify(newData, null, 2);

  // Проверяем — существует ли файл history.json
  let oldContent = null;
  if (fs.existsSync(DATA_PATH)) {
    oldContent = fs.readFileSync(DATA_PATH, "utf8");
  }

  // Если данные изменились — обновляем файл
  if (oldContent !== newContent) {
    fs.writeFileSync(DATA_PATH, newContent);
    console.log(`✅ Файл обновлён: ${newData.timestamp}`);
  } else {
    console.log("ℹ️ Данные не изменились — обновление пропущено");
  }
})();
