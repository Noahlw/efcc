const esc = (t) => String(t).replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const systemRoot = document.getElementById("systems");
const width = new URLSearchParams(location.search).get("w") || "390";
document.documentElement.style.setProperty("--frame-w", `${width}px`);

let lastTrack = null;
for (const s of ALL_SCREENS) {
  const trackHead = s.track !== lastTrack ? ((lastTrack = s.track), `<h3 class="group-label">${esc(s.track)}</h3>`) : "";
  const source = s.src ? `<small>${esc(s.src)}</small>` : `<small>延伸狀態</small>`;
  const deviceClass = s.desktop ? "device device--desktop" : "device";
  systemRoot.insertAdjacentHTML("beforeend", `${trackHead}
    <figure class="screen-card" id="screen-${s.id}">
      <figcaption class="screen-caption"><span>${esc(s.label)}</span>${source}</figcaption>
      ${s.note ? `<p class="screen-note">${esc(s.note)}</p>` : ""}
      <div class="${deviceClass}">${s.body}</div>
    </figure>`);
}
