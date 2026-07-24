await writeFile(
  "suomen_murrosvaiheet_syvennetty.json",
  JSON.stringify(murrosExport, null, 2) + "\n"
);

await writeFile(
  "artikkelit.json",
  JSON.stringify(artikkelitExport, null, 2) + "\n"
);

await writeFile(
  "yhdistys.json",
  JSON.stringify(yhdistysExport, null, 2) + "\n"
);
