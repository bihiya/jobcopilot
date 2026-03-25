export async function getProfileExample() {
  const response = await fetch("/api/profile", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new Error("Failed to load profile");
  }

  return response.json();
}

export async function saveProfileExample(profilePayload) {
  const response = await fetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profilePayload),
  });

  if (!response.ok) {
    throw new Error("Failed to save profile");
  }

  return response.json();
}
