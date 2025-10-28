import fs from "fs";
import path from "path";

const filePath = path.join(process.cwd(), "history.json");
const newData = {
  updated_at: new Date().toISOString(),
  data: "Example data"
};

// Если файла нет — создаём
if (!fs.existsSync(filePath)) {
  fs.writeFileSync(filePath, JSON.stringify(newData, null, 2));
  console.log("✅ Created new history.json");
} else {
  const oldData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  if (JSON.stringify(oldData) !== JSON.stringify(newData)) {
    fs.writeFileSync(filePath, JSON.stringify(newData, null, 2));
    console.log("✅ Updated history.json");
  } else {
    console.log("No changes detected");
  }
}
