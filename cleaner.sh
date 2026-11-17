#!/usr/bin/env bash
set -euo pipefail

echo "1. Удаляем файлы и папки заглушки AI Studio / Angular..."
rm -rf web dist-web .angular
rm -f angular.json index.html metadata.json tsconfig.app.json .env.example bun.lock

echo "2. Делаем tsconfig.cli.json основным tsconfig.json..."
mv tsconfig.cli.json tsconfig.json

node -e '
const fs = require("fs");

// Чистим tsconfig.json от упоминаний web / dist-web
const tsconfig = JSON.parse(fs.readFileSync("tsconfig.json", "utf8"));
tsconfig.exclude = (tsconfig.exclude || []).filter(
  (p) => p !== "web" && p !== "dist-web"
);
fs.writeFileSync("tsconfig.json", JSON.stringify(tsconfig, null, 2) + "\n");

// Обновляем tsconfig.eslint.json, чтобы он наследовался от tsconfig.json
const eslintTsconfig = JSON.parse(fs.readFileSync("tsconfig.eslint.json", "utf8"));
eslintTsconfig.extends = "./tsconfig.json";
eslintTsconfig.exclude = (eslintTsconfig.exclude || []).filter(
  (p) => p !== "web" && p !== "dist-web"
);
fs.writeFileSync("tsconfig.eslint.json", JSON.stringify(eslintTsconfig, null, 2) + "\n");

// Чистим package.json от Angular и приводим scripts в соответствие с README
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.scripts = {
  build: "tsc",
  start: "node dist/index.js",
  dev: "tsx src/index.ts",
  test: "vitest run",
  lint: "eslint src tests",
  format: "prettier --write \"src/**/*.ts\" \"tests/**/*.ts\" \"config/*.json\"",
  "format:check": "prettier --check \"src/**/*.ts\" \"tests/**/*.ts\" \"config/*.json\"",
  typecheck: "tsc --noEmit"
};

delete pkg.dependencies; // У CLI нет runtime-зависимостей

if (pkg.devDependencies) {
  for (const dep of Object.keys(pkg.devDependencies)) {
    if (dep.startsWith("@angular/")) {
      delete pkg.devDependencies[dep];
    }
  }
}

fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
'

echo "3. Убираем /.angular/cache из .gitignore..."
node -e '
const fs = require("fs");
const lines = fs.readFileSync(".gitignore", "utf8")
  .split("\n")
  .filter((line) => line.trim() !== "/.angular/cache");
fs.writeFileSync(".gitignore", lines.join("\n"));
'

echo "4. Пересобираем чистый package-lock.json без Angular..."
rm -rf node_modules package-lock.json dist
npm install

echo "5. Проверяем сборку, типы, линтер, форматирование и тесты..."
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
node dist/index.js --help

echo "Готово! Проект полностью очищен от Angular/AI Studio."
