const maj = Number(process.version.slice(1).split(".")[0]);
if (maj < 24 || Number.isNaN(maj)) {
  console.error(
    `This project targets Node.js 24 (you have ${process.version}).\n` +
      "Run: nvm install && nvm use   (see repo .nvmrc)\n" +
      "Or install from https://nodejs.org/"
  );
  process.exit(1);
}
