const fs = require('fs');
const path = require('path');

(async () => {
  try {
    const historyPath = path.join(process.cwd(), 'cs2run_history.json');

    // Читаем текущий JSON
    let history = [];
    if (fs.existsSync(historyPath)) {
      const data = fs.readFileSync(historyPath, 'utf8');
      history = JSON.parse(data);
    }

    // Лог для проверки
    console.log(`📊 Сейчас в истории ${history.length} записей`);

    // Добавляем "метку времени последнего обновления"
    const updatedAt = new Date().toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow'
    });

    const result = {
      updatedAt, // например "29.10.2025, 02:14:33"
      totalGames: history.length,
      averageCrash: (
        history.reduce((sum, item) => sum + item.crash, 0) / history.length
      ).toFixed(2),
      data: history
    };

    // Сохраняем всё в файл (теперь с метаданными)
    fs.writeFileSync(historyPath, JSON.stringify(result, null, 2));
    console.log(`✅ Коэффициенты обновлены (${updatedAt})`);

  } catch (error) {
    console.error('❌ Ошибка при обновлении данных:', error);
    process.exit(1);
  }
})();
