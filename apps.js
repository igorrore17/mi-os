// =========================================================================
// MySpatialOS — Fase 2: Apps Modulares
// (Chat IA, Apuntes Múltiples, YouTube, Visor PDF/Fotos, Pomodoro, Calc)
// =========================================================================

export function registerExtraApps(APPS, createWindow) {

  // 1. APUNTES MÚLTIPLES (reemplaza la nota simple de Fase 1)
  APPS.notes = () => {
    createWindow({
      title: "Apuntes",
      appId: "notes",
      w: 290,
      h: 260,
      buildContent(body) {
        const KEY = "spatialos_notes_v2";
        let notes = [];
        try { notes = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch {}
        if (!Array.isArray(notes) || notes.length === 0) {
          const old = localStorage.getItem("spatialos_note_main") || "";
          notes = [{ id: Date.now(), title: "Nota 1", text: old }];
        }
        let activeId = notes[0].id;

        body.innerHTML = `
          <div class="appToolbar">
            <select class="appSelect nSel"></select>
            <button class="miniBtn nAdd">+</button>
            <button class="miniBtn nDel">✕</button>
          </div>
          <input class="appInput nTitle" placeholder="Título de la nota..." />
          <textarea class="noteArea nText" placeholder="Escribe aquí..."></textarea>
        `;

        const sel = body.querySelector(".nSel");
        const titleIn = body.querySelector(".nTitle");
        const textIn = body.querySelector(".nText");

        const save = () => localStorage.setItem(KEY, JSON.stringify(notes));

        const renderList = () => {
          sel.innerHTML = notes
            .map((n) => `<option value="${n.id}" ${n.id === activeId ? "selected" : ""}>${n.title || "Sin título"}</option>`)
            .join("");
          const cur = notes.find((n) => n.id === activeId) || notes[0];
          activeId = cur.id;
          titleIn.value = cur.title;
          textIn.value = cur.text;
        };

        sel.addEventListener("change", () => {
          activeId = Number(sel.value);
          renderList();
        });

        titleIn.addEventListener("input", () => {
          const cur = notes.find((n) => n.id === activeId);
          if (!cur) return;
          cur.title = titleIn.value;
          const opt = sel.querySelector(`option[value="${activeId}"]`);
          if (opt) opt.textContent = cur.title || "Sin título";
          save();
        });

        textIn.addEventListener("input", () => {
          const cur = notes.find((n) => n.id === activeId);
          if (!cur) return;
          cur.text = textIn.value;
          save();
        });

        body.querySelector(".nAdd").addEventListener("click", () => {
          const n = { id: Date.now(), title: `Nota ${notes.length + 1}`, text: "" };
          notes.push(n);
          activeId = n.id;
          save();
          renderList();
        });

        body.querySelector(".nDel").addEventListener("click", () => {
          if (notes.length <= 1) {
            notes[0].text = "";
            save();
            renderList();
            return;
          }
          notes = notes.filter((n) => n.id !== activeId);
          activeId = notes[0].id;
          save();
          renderList();
        });

        renderList();
      }
    });
  };

  // 2. CHAT IA (Compatible con Groq, OpenRouter y OpenAI)
  APPS.ai = () => {
    createWindow({
      title: "Chat IA",
      appId: "ai",
      w: 300,
      h: 340,
      buildContent(body) {
        const CFG_KEY = "spatialos_ai_cfg";
        const PRESETS = {
          groq: { url: "https://api.groq.com/openai/v1/chat/completions", model: "llama-3.3-70b-versatile" },
          openrouter: { url: "https://openrouter.ai/api/v1/chat/completions", model: "google/gemini-2.5-flash" },
          openai: { url: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" }
        };

        let cfg = { apiKey: "", url: PRESETS.groq.url, model: PRESETS.groq.model };
        try { cfg = { ...cfg, ...JSON.parse(localStorage.getItem(CFG_KEY) || "{}") }; } catch {}

        let history = [];

        body.innerHTML = `
          <div class="aiWrap">
            <div class="appToolbar">
              <button class="miniBtn aiCfgBtn">API</button>
              <button class="miniBtn aiClearBtn">LIMPIAR</button>
              <span class="aiStatus">Listo</span>
            </div>
            <div class="aiCfgBox" style="display:none;">
              <div class="presetBar">
                <button class="miniBtn" data-aip="groq">GROQ</button>
                <button class="miniBtn" data-aip="openrouter">OPENROUTER</button>
                <button class="miniBtn" data-aip="openai">OPENAI</button>
              </div>
              <input class="appInput aiKey" type="password" placeholder="API Key (se guarda solo en tu dispositivo)" value="${cfg.apiKey}" />
              <input class="appInput aiUrl" placeholder="Endpoint URL" value="${cfg.url}" />
              <input class="appInput aiModel" placeholder="Modelo" value="${cfg.model}" />
            </div>
            <div class="aiLog"></div>
            <div class="aiInputRow">
              <input class="appInput aiPrompt" placeholder="Pregunta algo..." />
              <button class="miniBtn active aiSend">→</button>
            </div>
          </div>
        `;

        const cfgBox = body.querySelector(".aiCfgBox");
        const keyIn = body.querySelector(".aiKey");
        const urlIn = body.querySelector(".aiUrl");
        const modelIn = body.querySelector(".aiModel");
        const logEl = body.querySelector(".aiLog");
        const promptIn = body.querySelector(".aiPrompt");
        const sendBtn = body.querySelector(".aiSend");
        const statusEl = body.querySelector(".aiStatus");

        const saveCfg = () => {
          cfg = { apiKey: keyIn.value.trim(), url: urlIn.value.trim(), model: modelIn.value.trim() };
          localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
        };

        [keyIn, urlIn, modelIn].forEach((el) => el.addEventListener("input", saveCfg));

        body.querySelectorAll("[data-aip]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const p = PRESETS[btn.dataset.aip];
            urlIn.value = p.url;
            modelIn.value = p.model;
            saveCfg();
          });
        });

        body.querySelector(".aiCfgBtn").addEventListener("click", () => {
          cfgBox.style.display = cfgBox.style.display === "none" ? "flex" : "none";
        });

        body.querySelector(".aiClearBtn").addEventListener("click", () => {
          history = [];
          logEl.innerHTML = "";
        });

        const addMsg = (role, text) => {
          const div = document.createElement("div");
          div.className = `aiMsg ${role}`;
          div.textContent = text;
          logEl.appendChild(div);
          logEl.scrollTop = logEl.scrollHeight;
          return div;
        };

        if (!cfg.apiKey) {
          addMsg("assistant", "Pulsa 'API' arriba y pega tu clave (Groq, OpenRouter u OpenAI) para empezar.");
        }

        const send = async () => {
          const text = promptIn.value.trim();
          if (!text) return;
          if (!cfg.apiKey) {
            cfgBox.style.display = "flex";
            statusEl.textContent = "Falta API Key";
            return;
          }
          promptIn.value = "";
          addMsg("user", text);
          history.push({ role: "user", content: text });
          if (history.length > 14) history = history.slice(-14);

          sendBtn.disabled = true;
          statusEl.textContent = "Pensando...";
          const replyEl = addMsg("assistant", "...");

          try {
            const res = await fetch(cfg.url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${cfg.apiKey}`
              },
              body: JSON.stringify({
                model: cfg.model,
                messages: [
                  { role: "system", content: "Responde de forma clara, directa y concisa en español." },
                  ...history
                ]
              })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
            const reply = data.choices?.[0]?.message?.content?.trim() || "(Sin respuesta)";
            replyEl.textContent = reply;
            history.push({ role: "assistant", content: reply });
            statusEl.textContent = "Listo";
          } catch (err) {
            replyEl.textContent = `Error: ${err.message}`;
            statusEl.textContent = "Error";
          } finally {
            sendBtn.disabled = false;
            logEl.scrollTop = logEl.scrollHeight;
          }
        };

        sendBtn.addEventListener("click", send);
        promptIn.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
      }
    });
  };

  // 3. YOUTUBE FLOTANTE (con playsinline=1 para no forzar pantalla completa en iPhone)
  APPS.youtube = () => {
    createWindow({
      title: "YouTube",
      appId: "youtube",
      w: 310,
      h: 245,
      buildContent(body) {
        body.innerHTML = `
          <div class="appToolbar">
            <input class="appInput ytUrl" placeholder="Pega enlace o ID de YouTube..." />
            <button class="miniBtn active ytGo">VER</button>
          </div>
          <div class="ytFrameWrap">
            <div class="ytEmpty">Pega cualquier enlace de YouTube arriba</div>
          </div>
        `;

        const input = body.querySelector(".ytUrl");
        const wrap = body.querySelector(".ytFrameWrap");

        const extractId = (val) => {
          const s = val.trim();
          if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
          const m = s.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([a-zA-Z0-9_-]{11})/);
          return m ? m[1] : null;
        };

        const loadVideo = () => {
          const id = extractId(input.value);
          if (!id) {
            wrap.innerHTML = `<div class="ytEmpty">Enlace no válido</div>`;
            return;
          }
          wrap.innerHTML = `
            <iframe
              class="ytFrame"
              src="https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowfullscreen
            ></iframe>
          `;
        };

        body.querySelector(".ytGo").addEventListener("click", loadVideo);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") loadVideo(); });
      }
    });
  };

  // 4. VISOR DE PDFs Y FOTOS LOCALES
  APPS.viewer = () => {
    createWindow({
      title: "Visor PDF / Foto",
      appId: "viewer",
      w: 300,
      h: 320,
      buildContent(body) {
        let blobUrl = null;
        body.innerHTML = `
          <div class="appToolbar">
            <button class="miniBtn active vPick">ABRIR ARCHIVO</button>
            <input class="vZoom" type="range" min="100" max="250" value="100" style="display:none; flex:1;" />
            <input class="vFile" type="file" accept="application/pdf,image/*" hidden />
          </div>
          <div class="vStage"><div class="ytEmpty">Abre una foto o PDF de tus apuntes</div></div>
        `;

        const fileIn = body.querySelector(".vFile");
        const stageEl = body.querySelector(".vStage");
        const zoomIn = body.querySelector(".vZoom");

        body.querySelector(".vPick").addEventListener("click", () => fileIn.click());

        fileIn.addEventListener("change", () => {
          const file = fileIn.files?.[0];
          if (!file) return;
          if (blobUrl) URL.revokeObjectURL(blobUrl);
          blobUrl = URL.createObjectURL(file);

          if (file.type.startsWith("image/")) {
            zoomIn.style.display = "block";
            zoomIn.value = 100;
            stageEl.innerHTML = `<img class="vImg" src="${blobUrl}" style="width:100%;" />`;
            const img = stageEl.querySelector(".vImg");
            zoomIn.oninput = () => { img.style.width = `${zoomIn.value}%`; };
          } else {
            zoomIn.style.display = "none";
            stageEl.innerHTML = `<iframe class="vPdf" src="${blobUrl}"></iframe>`;
          }
        });

        return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
      }
    });
  };

  // 5. POMODORO / TEMPORIZADOR DE ESTUDIO
  APPS.pomodoro = () => {
    createWindow({
      title: "Pomodoro",
      appId: "pomodoro",
      w: 245,
      h: 195,
      buildContent(body) {
        let totalSec = 25 * 60;
        let leftSec = totalSec;
        let timer = null;

        body.innerHTML = `
          <div class="clockBig pTime">25:00</div>
          <div class="presetBar" style="justify-content:center; margin:10px 0;">
            <button class="miniBtn active" data-min="25">25m</button>
            <button class="miniBtn" data-min="50">50m</button>
            <button class="miniBtn" data-min="5">5m</button>
          </div>
          <div class="presetBar" style="justify-content:center;">
            <button class="miniBtn active pToggle">INICIAR</button>
            <button class="miniBtn pReset">RESET</button>
          </div>
        `;

        const timeEl = body.querySelector(".pTime");
        const toggleBtn = body.querySelector(".pToggle");

        const render = () => {
          const m = String(Math.floor(leftSec / 60)).padStart(2, "0");
          const s = String(leftSec % 60).padStart(2, "0");
          timeEl.textContent = `${m}:${s}`;
        };

        const stop = () => {
          if (timer) { clearInterval(timer); timer = null; }
          toggleBtn.textContent = "INICIAR";
        };

        toggleBtn.addEventListener("click", () => {
          if (timer) {
            stop();
          } else {
            toggleBtn.textContent = "PAUSA";
            timer = setInterval(() => {
              if (leftSec > 0) {
                leftSec--;
                render();
              } else {
                stop();
                timeEl.textContent = "FIN";
              }
            }, 1000);
          }
        });

        body.querySelector(".pReset").addEventListener("click", () => {
          stop();
          leftSec = totalSec;
          render();
        });

        body.querySelectorAll("[data-min]").forEach((btn) => {
          btn.addEventListener("click", () => {
            stop();
            totalSec = Number(btn.dataset.min) * 60;
            leftSec = totalSec;
            body.querySelectorAll("[data-min]").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            render();
          });
        });

        return () => stop();
      }
    });
  };

  // 6. CALCULADORA COMPACTA
  APPS.calc = () => {
    createWindow({
      title: "Calculadora",
      appId: "calc",
      w: 230,
      h: 270,
      buildContent(body) {
        const KEYS = [
          "C", "(", ")", "/",
          "7", "8", "9", "*",
          "4", "5", "6", "-",
          "1", "2", "3", "+",
          "0", ".", "⌫", "="
        ];
        body.innerHTML = `
          <div class="calcScreen">0</div>
          <div class="calcGrid">
            ${KEYS.map((k) => `<button class="calcKey ${k === "=" ? "eq" : ""}" data-k="${k}">${k}</button>`).join("")}
          </div>
        `;

        const screen = body.querySelector(".calcScreen");
        let expr = "";

        body.querySelectorAll(".calcKey").forEach((btn) => {
          btn.addEventListener("click", () => {
            const k = btn.dataset.k;
            if (k === "C") expr = "";
            else if (k === "⌫") expr = expr.slice(0, -1);
            else if (k === "=") {
              try {
                if (!/^[0-9+\-*/.() ]+$/.test(expr)) throw new Error();
                const res = Function(`"use strict"; return (${expr})`)();
                expr = Number.isFinite(res) ? String(Math.round(res * 1e8) / 1e8) : "Error";
              } catch {
                expr = "Error";
              }
            } else {
              if (expr === "Error") expr = "";
              expr += k;
            }
            screen.textContent = expr || "0";
          });
        });
      }
    });
  };
}
