const fs = require("fs");
const path = require("path");

// Путь к файлу с историей
const historyPath = path.join(process.cwd(), "cs2run_history.json");

try {
  // Проверяем, существует ли файл
  let history = [];
  if (fs.existsSync(historyPath)) {
    const content = fs.readFileSync(historyPath, "utf8").trim();
    if (content) {
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          history = parsed;
        } else {
          console.warn("⚠️ Файл истории не содержит массив, сбрасываю");
        }
      } catch (e) {
        console.warn("⚠️ Ошибка чтения JSON, создаю новый массив");
      }
    }
  }

  console.log(`📊 Сейчас в истории ${history.length} записей`);

  // --- Здесь можно вставить твой парсер ---
  // Пример новых данных
  const newData = {
    time: new Date().toISOString(),
    avg: Math.random() * 2 + 1,
    games: Math.floor(Math.random() * 10 + 1)
  };

  // Добавляем запись в начало
  history.unshift(newData);

  // Сохраняем
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));

  console.log(`✅ Добавлено новое значение: ${newData.avg.toFixed(2)} (${newData.games} игр)`);
  console.log(`🕒 Последнее обновление: ${new Date().toLocaleString("ru-RU")}`);

} catch (err) {
  console.error("❌ Ошибка при обновлении данных:", err);
  process.exit(1);
}
