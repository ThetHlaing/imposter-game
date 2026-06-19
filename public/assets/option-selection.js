export function chooseUnusedOption(options, usedIds = [], previousId = null, random = Math.random) {
  if (options.length === 0) {
    return null;
  }

  const optionIds = new Set(options.map((option) => option.id));
  const validUsedIds = new Set(usedIds.filter((id) => optionIds.has(id)));
  let availableOptions = options.filter((option) => !validUsedIds.has(option.id));

  if (availableOptions.length === 0) {
    availableOptions = options.filter((option) => option.id !== previousId);
  }

  if (availableOptions.length === 0) {
    availableOptions = options;
  }

  return availableOptions[Math.floor(random() * availableOptions.length)];
}

export function updateUsedOptionIds(options, usedIds = [], selectedId) {
  const optionIds = new Set(options.map((option) => option.id));
  const validUsedIds = [...new Set(usedIds.filter((id) => optionIds.has(id)))];

  if (validUsedIds.length >= options.length) {
    return [selectedId];
  }

  return [...validUsedIds.filter((id) => id !== selectedId), selectedId];
}
