"use strict";

/* =====================================================
   TKB CAO ĐẲNG ĐIỆN TỬ - ĐIỆN LẠNH HÀ NỘI

   GOOGLE SHEET
        ↓
   GOOGLE APPS SCRIPT
        ↓
   CLOUDFLARE WORKER
        ↓
   APP.JS
        ↓
   LOCAL STORAGE

   API CHỈ ĐƯỢC GỌI KHI:
   BẤM "ĐỒNG BỘ DỮ LIỆU"

   QUYỀN FULL:
   https://name-gift.github.io/

   APP.JS KHÔNG GỌI GAS TRỰC TIẾP.
===================================================== */


/* =====================================================
   CẤU HÌNH CLOUDFLARE WORKER
===================================================== */

const DEFAULT_API_URL =
  "https://api-thoi-khoa-bieu.abcd1601ab.workers.dev/api/tkb";


/* =====================================================
   LOCAL STORAGE
===================================================== */

const STORAGE_KEY =
  "tkb_ha_noi_data_v1";

const LAST_SYNC_KEY =
  "tkb_ha_noi_last_sync";


/* =====================================================
   NGÀY
===================================================== */

const DAYS = [
  "Thứ 2",
  "Thứ 3",
  "Thứ 4",
  "Thứ 5",
  "Thứ 6"
];


/* =====================================================
   TRẠNG THÁI
===================================================== */

let data = loadLocalData();

let currentView = "all";

let selectedWeeks = [];

let selectedShifts = [];


/* =====================================================
   LOAD LOCAL DATA
===================================================== */

function loadLocalData() {

  try {

    const raw =
      localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return emptyData();
    }

    const parsed =
      JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !== "object"
    ) {
      return emptyData();
    }

    return parsed;

  } catch (error) {

    console.error(
      "Lỗi đọc dữ liệu:",
      error
    );

    return emptyData();

  }

}


/* =====================================================
   DATA RỖNG
===================================================== */

function emptyData() {

  return {

    success: false,

    access: "none",

    fullAccess: false,

    meta: {

      school:
        "TRƯỜNG CAO ĐẲNG ĐIỆN TỬ - ĐIỆN LẠNH HÀ NỘI",

      schoolYear:
        "2026-2027"

    },

    class11e3: {

      id:
        "11e3",

      title:
        "LỚP 11E3",

      subtitle:
        "Chưa đồng bộ dữ liệu",

      room:
        "",

      homeroom:
        "",

      phone:
        "",

      motto:
        "HỌC CHO CHÍNH MÌNH",

      rules: [
        "Toán 4t",
        "Văn 4t",
        "Lý/Hóa/Sinh/Địa 2t",
        "Sử 3t",
        "HĐTN 3t"
      ],

      periods: [
        ["13h00", "13h45"],
        ["13h50", "14h35"],
        ["14h45", "15h30"],
        ["15h35", "16h20"],
        ["16h25", "17h10"]
      ],

      days: {}

    },

    class52dt: {

      id:
        "52dt",

      title:
        "LỚP 52ĐT",

      note:
        "Chưa đồng bộ dữ liệu",

      weeks: [],

      notes: []

    }

  };

}


/* =====================================================
   SAVE LOCAL DATA
===================================================== */

function saveLocalData(newData) {

  try {

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(newData)
    );

    data = newData;

    return true;

  } catch (error) {

    console.error(
      "Không thể lưu:",
      error
    );

    toast(
      "Không thể lưu dữ liệu trên trình duyệt."
    );

    return false;

  }

}


/* =====================================================
   ESCAPE HTML
===================================================== */

function esc(value) {

  return String(value ?? "")

    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


/* =====================================================
   LẤY CA TỪ SESSION
===================================================== */

function getSessionShift(session) {

  if (!session) {
    return null;
  }


  /*
     OBJECT
  */

  if (
    typeof session === "object" &&
    !Array.isArray(session)
  ) {

    const text = [
      session.shift,
      session.ca,
      session.session,
      session.subject,
      session.teacher,
      session.room
    ]

      .filter(Boolean)
      .join(" ");


    const match =
      text.match(
        /(?:_Ca|Ca\s*)([0-9]+)/i
      );


    return match
      ? String(match[1])
      : null;

  }


  /*
     ARRAY
  */

  if (Array.isArray(session)) {

    /*
       Tìm đệ quy để hỗ trợ:
       [room, subject, teacher]
       hoặc
       [[...Ca1], [...Ca2]]
    */

    for (
      const item of session
    ) {

      const shift =
        getSessionShift(item);

      if (shift) {
        return shift;
      }

    }


    const text =
      session
        .filter(
          item =>
            typeof item !== "object"
        )
        .filter(Boolean)
        .join(" ");


    const match =
      text.match(
        /(?:_Ca|Ca\s*)([0-9]+)/i
      );


    return match
      ? String(match[1])
      : null;

  }


  return null;

}


/* =====================================================
   KIỂM TRA SESSION CÓ CA ĐƯỢC CHỌN
===================================================== */

function sessionContainsShift(
  session,
  selectedShift
) {

  if (!session) {
    return false;
  }

  if (!selectedShift) {
    return false;
  }


  /*
     OBJECT
  */

  if (
    typeof session === "object" &&
    !Array.isArray(session)
  ) {

    const shift =
      getSessionShift(session);

    if (!shift) {
      return true;
    }

    return (
      String(shift) ===
      String(selectedShift)
    );

  }


  /*
     ARRAY
  */

  if (Array.isArray(session)) {

    /*
       Nếu là một session phẳng:
       [Phòng, Môn, Giáo viên]
    */

    const directShift =
      getSessionShift(session);

    if (
      directShift &&
      session.every(
        item =>
          typeof item !== "object" ||
          item === null
      )
    ) {

      return (
        String(directShift) ===
        String(selectedShift)
      );

    }


    /*
       Nếu là nhiều session:
       [[Ca1], [Ca2]]
    */

    for (
      const item of session
    ) {

      if (
        sessionContainsShift(
          item,
          selectedShift
        )
      ) {

        return true;

      }

    }


    /*
       Không có thông tin ca
       → vẫn cho hiển thị.
    */

    return !directShift;

  }


  return false;

}


/* =====================================================
   XÓA KÝ HIỆU CA KHI HIỂN THỊ
===================================================== */

function cleanShiftText(value) {

  return String(value ?? "")

    .replace(
      /_Ca[0-9]+\b/gi,
      ""
    )

    .replace(
      /\bCa\s*[0-9]+\b/gi,
      ""
    )

    .trim();

}


/* =====================================================
   LẤY TOÀN BỘ TUẦN TỪ API
===================================================== */

function getApiWeeks() {

  const weeks =
    data?.class52dt?.weeks;

  if (!Array.isArray(weeks)) {
    return [];
  }

  return weeks

    .map(
      (week, index) => {

        if (
          week &&
          typeof week === "object"
        ) {

          return {

            ...week,

            weekStart:
              Number(
                week.weekStart
              ),

            weekEnd:
              Number(
                week.weekEnd
              )

          };

        }

        return null;

      }
    )

    .filter(
      week =>
        week &&
        Number.isFinite(
          week.weekStart
        ) &&
        Number.isFinite(
          week.weekEnd
        )
    )

    .sort(
      (a, b) =>
        a.weekStart -
        b.weekStart
    );

}


/* =====================================================
   LẤY DANH SÁCH TUẦN THỰC TẾ
===================================================== */

function getAvailableWeeks() {

  const weeks =
    getApiWeeks();

  const result = [];

  weeks.forEach(
    week => {

      for (
        let w = week.weekStart;
        w <= week.weekEnd;
        w++
      ) {

        if (
          !result.includes(
            String(w)
          )
        ) {

          result.push(
            String(w)
          );

        }

      }

    }
  );

  return result.sort(
    (a, b) =>
      Number(a) -
      Number(b)
  );

}


/* =====================================================
   LẤY TOÀN BỘ CA THỰC TẾ TỪ API
===================================================== */

function getAvailableShifts() {

  const shifts =
    new Set();

  const weeks =
    getApiWeeks();


  weeks.forEach(
    week => {

      const days =
        week.days || {};


      DAYS.forEach(
        day => {

          const sessions =
            days[day];


          if (
            !Array.isArray(
              sessions
            )
          ) {

            return;

          }


          /*
             SÁNG = NGHỀ
          */

          const morning =
            sessions[0];


          if (!morning) {
            return;
          }


          /*
             Lấy toàn bộ chuỗi
             để tìm Ca1 / Ca2.
          */

          collectSessionShifts(
            morning,
            shifts
          );

        }
      );

    }
  );


  return Array.from(shifts)

    .sort(
      (a, b) =>
        Number(a) -
        Number(b)
    );

}


/* =====================================================
   THU THẬP CA ĐỆ QUY
===================================================== */

function collectSessionShifts(
  session,
  result
) {

  if (!session) {
    return;
  }


  if (
    typeof session === "object" &&
    !Array.isArray(session)
  ) {

    const shift =
      getSessionShift(session);

    if (shift) {
      result.add(
        String(shift)
      );
    }

    return;

  }


  if (Array.isArray(session)) {

    /*
       Session phẳng.
    */

    const directText =
      session
        .filter(
          item =>
            typeof item !== "object"
        )
        .filter(Boolean)
        .join(" ");


    const matches =
      directText.match(
        /(?:_Ca|Ca\s*)([0-9]+)/gi
      );


    if (matches) {

      matches.forEach(
        item => {

          const match =
            item.match(
              /([0-9]+)/
            );

          if (match) {

            result.add(
              String(
                match[1]
              )
            );

          }

        }
      );

    }


    /*
       Session lồng nhau.
    */

    session.forEach(
      item => {

        if (
          Array.isArray(item) ||
          (
            item &&
            typeof item === "object"
          )
        ) {

          collectSessionShifts(
            item,
            result
          );

        }

      }
    );

  }

}


/* =====================================================
   KIỂM TRA ĐÃ CÓ DỮ LIỆU ĐỒNG BỘ
===================================================== */

function hasSyncedData() {

  const raw =
    localStorage.getItem(
      STORAGE_KEY
    );

  const lastSync =
    localStorage.getItem(
      LAST_SYNC_KEY
    );


  if (
    !raw ||
    !lastSync
  ) {

    return false;

  }


  try {

    const parsed =
      JSON.parse(raw);


    return !!(
      parsed &&
      parsed.class52dt &&
      parsed.class11e3
    );

  } catch {

    return false;

  }

}


/* =====================================================
   KHỞI TẠO TUẦN / CA TỪ LOCAL DATA
===================================================== */

function initializeFiltersFromData() {

  /*
     CHƯA ĐỒNG BỘ
  */

  if (!hasSyncedData()) {

    selectedWeeks = [];

    selectedShifts = [];

    return;

  }


  const weeks =
    getAvailableWeeks();

  const shifts =
    getAvailableShifts();


  /*
     TUẦN
  */

  if (
    !selectedWeeks.length ||
    !weeks.includes(
      String(
        selectedWeeks[0]
      )
    )
  ) {

    selectedWeeks =
      weeks.length
        ? [weeks[0]]
        : [];

  }


  /*
     CA
  */

  if (
    !selectedShifts.length ||
    !shifts.includes(
      String(
        selectedShifts[0]
      )
    )
  ) {

    selectedShifts =
      shifts.length
        ? [shifts[0]]
        : [];

  }

}


/* =====================================================
   TUẦN ĐƯỢC CHỌN
===================================================== */

function getSelectedWeek() {

  if (
    !hasSyncedData()
  ) {

    return null;

  }

  return (
    selectedWeeks[0] ||
    null
  );

}


/* =====================================================
   CA ĐƯỢC CHỌN
===================================================== */

function getSelectedShift() {

  if (
    !hasSyncedData()
  ) {

    return null;

  }

  return (
    selectedShifts[0] ||
    null
  );

}


/* =====================================================
   KIỂM TRA TUẦN
===================================================== */

function weekMatchesFilter(week) {

  if (!week) {
    return false;
  }


  const selected =
    Number(
      getSelectedWeek()
    );


  if (
    !Number.isFinite(selected)
  ) {

    return false;

  }


  const start =
    Number(
      week.weekStart
    );

  const end =
    Number(
      week.weekEnd
    );


  return (
    selected >= start &&
    selected <= end
  );

}


/* =====================================================
   KIỂM TRA CA NGHỀ
===================================================== */

function vocationalSessionVisible(
  session
) {

  if (!session) {
    return false;
  }


  const selectedShift =
    getSelectedShift();


  if (!selectedShift) {
    return false;
  }


  return sessionContainsShift(
    session,
    selectedShift
  );

}


/* =====================================================
   RENDER SESSION ĐƠN
===================================================== */

function renderSingleSession(
  session
) {

  if (!session) {

    return `
      <div class="session empty">
        —
      </div>
    `;

  }


  /*
     OBJECT
  */

  if (
    typeof session === "object" &&
    !Array.isArray(session)
  ) {

    return `
      <div class="session">

        ${
          session.room
            ? `
              <div class="room">
                ${esc(
                  cleanShiftText(
                    session.room
                  )
                )}
              </div>
            `
            : ""
        }

        ${
          session.subject
            ? `
              <div class="subject">
                ${esc(
                  cleanShiftText(
                    session.subject
                  )
                )}
              </div>
            `
            : ""
        }

        ${
          session.teacher
            ? `
              <div class="teacher">
                ${esc(
                  cleanShiftText(
                    session.teacher
                  )
                )}
              </div>
            `
            : ""
        }

      </div>
    `;

  }


  /*
     ARRAY SESSION
  */

  if (Array.isArray(session)) {

    if (
      session.length >= 3 &&
      !Array.isArray(session[0])
    ) {

      return `
        <div class="session">

          <div class="room">
            ${esc(
              cleanShiftText(
                session[0]
              )
            )}
          </div>

          <div class="subject">
            ${esc(
              cleanShiftText(
                session[1]
              )
            )}
          </div>

          ${
            session[2]
              ? `
                <div class="teacher">
                  ${esc(
                    cleanShiftText(
                      session[2]
                    )
                  )}
                </div>
              `
              : ""
          }

        </div>
      `;

    }


    /*
       Dạng:
       [Môn, Giáo viên]
    */

    if (
      session.length >= 2 &&
      !Array.isArray(session[0])
    ) {

      return `
        <div class="session">

          <div class="subject">
            ${esc(
              cleanShiftText(
                session[0]
              )
            )}
          </div>

          ${
            session[1]
              ? `
                <div class="teacher">
                  ${esc(
                    cleanShiftText(
                      session[1]
                    )
                  )}
                </div>
              `
              : ""
          }

        </div>
      `;

    }

  }


  return `
    <div class="session">
      <div class="subject">
        ${esc(
          cleanShiftText(
            session
          )
        )}
      </div>
    </div>
  `;

}


/* =====================================================
   HIỂN THỊ NGHỀ
===================================================== */

function vocationalSessionHtml(
  session
) {

  if (!session) {

    return `
      <div class="session empty">
        —
      </div>
    `;

  }


  if (
    !vocationalSessionVisible(
      session
    )
  ) {

    return `
      <div class="session empty">
        —
      </div>
    `;

  }


  /*
     Nếu là một session đơn
  */

  if (
    !Array.isArray(session) ||
    (
      session.length &&
      !Array.isArray(session[0])
    )
  ) {

    return renderSingleSession(
      session
    );

  }


  /*
     Nếu có nhiều session:
     [[Ca1], [Ca2]]
     
     Chỉ hiển thị session
     đúng ca đang chọn.
  */

  const selectedShift =
    getSelectedShift();


  const visible =
    session.filter(
      item =>
        sessionContainsShift(
          item,
          selectedShift
        )
    );


  if (!visible.length) {

    return `
      <div class="session empty">
        —
      </div>
    `;

  }


  return visible
    .map(
      item =>
        renderSingleSession(
          item
        )
    )
    .join("");

}


/* =====================================================
   HIỂN THỊ VĂN HÓA
   CHIỀU KHÔNG LỌC CA
===================================================== */

function cultureSessionHtml(
  session
) {

  if (!session) {

    return `
      <div class="session empty">
        —
      </div>
    `;

  }


  /*
     Session đơn
  */

  if (
    !Array.isArray(session) ||
    (
      session.length &&
      !Array.isArray(session[0])
    )
  ) {

    return renderSingleSession(
      session
    );

  }


  /*
     Nhiều session
  */

  return session
    .map(
      item =>
        renderSingleSession(
          item
        )
    )
    .join("");

}


/* =====================================================
   RENDER 11E3
===================================================== */

function render11e3() {

  const c =
    data.class11e3;


  if (!c) {

    return `
      <section class="section">

        <div class="no-data">
          Không có dữ liệu lớp 11E3.
        </div>

      </section>
    `;

  }


  const periods =
    Array.isArray(c.periods)
      ? c.periods
      : [];


  let rows = "";


  for (
    let i = 0;
    i < 5;
    i++
  ) {

    const period =
      periods[i] ||
      ["", ""];


    const dayCells =
      DAYS.map(
        day => {

          const session =
            c.days &&
            c.days[day]
              ? c.days[day][i]
              : null;


          if (!session) {

            return `
              <td>
                <span class="empty">
                  —
                </span>
              </td>
            `;

          }


          if (
            Array.isArray(session)
          ) {

            return `
              <td>

                <div class="subject">
                  ${esc(
                    session[0]
                  )}
                </div>

                ${
                  session[1]
                    ? `
                      <div class="teacher">
                        ${esc(
                          session[1]
                        )}
                      </div>
                    `
                    : ""
                }

              </td>
            `;

          }


          return `
            <td>

              ${
                session.subject
                  ? `
                    <div class="subject">
                      ${esc(
                        session.subject
                      )}
                    </div>
                  `
                  : ""
              }

              ${
                session.teacher
                  ? `
                    <div class="teacher">
                      ${esc(
                        session.teacher
                      )}
                    </div>
                  `
                  : ""
              }

            </td>
          `;

        }
      ).join("");


    rows += `
      <tr>

        <td class="rule">
          ${esc(
            c.rules?.[i] || ""
          )}
        </td>

        <td class="time">
          ${esc(period[0])}
          -
          ${esc(period[1])}
        </td>

        ${dayCells}

      </tr>
    `;

  }


  return `
    <section class="section">

      <div class="green-title">

        ${esc(c.title)}

        ·

        GVCN:
        ${esc(c.homeroom || "")}

        ${
          c.phone
            ? ` · ${esc(c.phone)}`
            : ""
        }

      </div>


      <div class="section-head">

        <div>

          <h2>
            Thời khóa biểu
          </h2>

          <p>
            ${esc(
              c.subtitle || ""
            )}
          </p>

        </div>


        ${
          c.room
            ? `
              <span class="badge">
                ${esc(c.room)}
              </span>
            `
            : ""
        }

      </div>


      <div class="schedule-wrap">

        <table class="schedule">

          <thead>

            <tr>

              <th>
                Phân bổ tiết
              </th>

              <th>
                Thời gian học
              </th>

              ${DAYS.map(
                day =>
                  `<th>${esc(day)}</th>`
              ).join("")}

            </tr>

          </thead>


          <tbody>
            ${rows}
          </tbody>

        </table>

      </div>


      ${
        c.motto
          ? `
            <div class="motto">
              "${esc(c.motto)}"
            </div>
          `
          : ""
      }

    </section>
  `;

}


/* =====================================================
   KIỂM TRA TUẦN CÓ DỮ LIỆU
===================================================== */

function weekHasVisibleData(week) {

  if (!week) {
    return false;
  }


  for (
    const day of DAYS
  ) {

    const sessions =
      week.days?.[day] || [];


    const morning =
      sessions[0];

    const afternoon =
      sessions[1];


    /*
       SÁNG = NGHỀ
    */

    if (
      morning &&
      vocationalSessionVisible(
        morning
      )
    ) {

      return true;

    }


    /*
       CHIỀU = VĂN HÓA
    */

    if (afternoon) {

      return true;

    }

  }


  return false;

}


/* =====================================================
   RENDER 52ĐT
===================================================== */

function render52dt() {

  const c =
    data.class52dt;


  if (!hasSyncedData()) {

    return `
      <section class="section">

        <div class="section-head">

          <div>

            <h2>
              LỚP 52ĐT
            </h2>

            <p>
              Chưa có dữ liệu thời khóa biểu.
            </p>

          </div>

        </div>


        <div class="note">

          Chưa có dữ liệu tuần và ca.

          <br><br>

          Vui lòng bấm
          <b>“Đồng bộ dữ liệu”</b>
          để tải dữ liệu.

        </div>

      </section>
    `;

  }


  if (!c) {

    return `
      <section class="section">

        <div class="no-data">
          Không có dữ liệu lớp 52ĐT.
        </div>

      </section>
    `;

  }


  const weeks =
    getApiWeeks();


  const visibleWeeks =
    weeks.filter(
      week =>
        weekMatchesFilter(
          week
        ) &&
        weekHasVisibleData(
          week
        )
    );


  if (
    !visibleWeeks.length
  ) {

    return `
      <section class="section">

        <div class="section-head">

          <div>

            <h2>
              ${esc(
                c.title ||
                "LỚP 52ĐT"
              )}
            </h2>

            <p>
              ${esc(
                c.note ||
                ""
              )}
            </p>

          </div>

        </div>


        <div class="note">

          Không có lịch học phù hợp.

          <br><br>

          Tuần:

          <b>
            ${
              getSelectedWeek()
                ? `Tuần ${esc(
                    getSelectedWeek()
                  )}`
                : "Chưa có dữ liệu tuần"
            }
          </b>

          ·

          Ca:

          <b>
            ${
              getSelectedShift()
                ? `Ca ${esc(
                    getSelectedShift()
                  )}`
                : "Chưa có dữ liệu ca"
            }
          </b>

        </div>

      </section>
    `;

  }


  return `
    <section class="section">

      <div class="section-head">

        <div>

          <h2>
            ${esc(
              c.title ||
              "LỚP 52ĐT"
            )}
          </h2>

          <p>
            ${esc(
              c.note ||
              "Thời khóa biểu các lớp 52ĐT"
            )}
          </p>

        </div>


        <span class="badge">
          52ĐT
        </span>

      </div>


      ${visibleWeeks.map(
        week => `

          <div class="week-block">

            <div
              class="
                week-head
                ${
                  week.currentRed
                    ? "current"
                    : ""
                }
              "
            >

              <span>

                ${esc(
                  week.label ||
                  `Tuần ${week.weekStart}`
                )}

              </span>


              <span>
                ☀ Sáng · ☾ Chiều
              </span>

            </div>


            <div class="week-table-wrap">

              <table class="week-table">

                <thead>

                  <tr>

                    <th>
                      Buổi
                    </th>

                    ${DAYS.map(
                      day =>
                        `<th>${esc(day)}</th>`
                    ).join("")}

                  </tr>

                </thead>


                <tbody>

                  <tr>

                    <th class="day-name">
                      Sáng
                    </th>


                    ${DAYS.map(
                      day => {

                        const session =
                          week.days?.[day]?.[0];


                        return `
                          <td>

                            ${vocationalSessionHtml(
                              session
                            )}

                          </td>
                        `;

                      }
                    ).join("")}

                  </tr>


                  <tr>

                    <th class="day-name">
                      Chiều
                    </th>


                    ${DAYS.map(
                      day => {

                        const session =
                          week.days?.[day]?.[1];


                        return `
                          <td>

                            ${cultureSessionHtml(
                              session
                            )}

                          </td>
                        `;

                      }
                    ).join("")}

                  </tr>

                </tbody>

              </table>

            </div>

          </div>

        `
      ).join("")}


      ${
        Array.isArray(c.notes) &&
        c.notes.length
          ? `
            <div class="note">

              <b>
                Ghi chú:
              </b>

              <br>

              ${c.notes.map(
                note =>
                  `• ${esc(note)}`
              ).join("<br>")}

            </div>
          `
          : ""
      }

    </section>
  `;

}


/* =====================================================
   RENDER CHÍNH
===================================================== */

function render() {

  const app =
    document.getElementById(
      "app"
    );


  if (!app) {
    return;
  }


  if (
    currentView === "11e3"
  ) {

    app.innerHTML =
      render11e3();

  }

  else if (
    currentView === "52dt"
  ) {

    app.innerHTML =
      render52dt();

  }

  else {

    app.innerHTML = `

      <div class="all-grid">

        ${render11e3()}

        ${render52dt()}

      </div>

    `;

  }


  updateWeekDropdownText();

  updateFilterUI();

  updateFilterVisibility();

  updateDateText();

  updateStatus();

}


/* =====================================================
   DROPDOWN TUẦN
===================================================== */

function updateWeekDropdownText() {

  const el =
    document.getElementById(
      "selectedWeekText"
    );


  if (!el) {
    return;
  }


  if (!hasSyncedData()) {

    el.textContent =
      "Chưa có dữ liệu tuần";

    return;

  }


  const week =
    getSelectedWeek();


  el.textContent =
    week
      ? `Tuần ${week}`
      : "Chưa có dữ liệu tuần";

}


/* =====================================================
   TẠO CHECKBOX TUẦN
===================================================== */

function ensureWeekCheckboxes() {

  const list =
    document.getElementById(
      "weekDropdownList"
    );


  if (!list) {
    return;
  }


  list.innerHTML = "";


  if (!hasSyncedData()) {

    list.innerHTML = `
      <div class="week-empty">
        Chưa có dữ liệu tuần
      </div>
    `;

    return;

  }


  const weeks =
    getAvailableWeeks();


  if (!weeks.length) {

    list.innerHTML = `
      <div class="week-empty">
        Không có dữ liệu tuần
      </div>
    `;

    return;

  }


  weeks.forEach(
    week => {

      const label =
        document.createElement(
          "label"
        );


      label.className =
        "week-option";


      label.innerHTML = `

        <input
          type="checkbox"
          name="week"
          value="${esc(week)}"
          ${
            selectedWeeks.includes(
              String(week)
            )
              ? "checked"
              : ""
          }
        >

        <span>
          Tuần ${esc(week)}
        </span>

      `;


      list.appendChild(
        label
      );

    }
  );

}


/* =====================================================
   TẠO CHECKBOX CA
===================================================== */

function ensureShiftCheckboxes() {

  const shifts =
    hasSyncedData()
      ? getAvailableShifts()
      : [];


  const container =
    document.querySelector(
      ".shift-options"
    );


  if (!container) {
    return;
  }


  if (!hasSyncedData()) {

    container.innerHTML = `
      <div class="shift-empty">
        Chưa có dữ liệu ca
      </div>
    `;

    return;

  }


  container.innerHTML = "";


  if (!shifts.length) {

    container.innerHTML = `
      <div class="shift-empty">
        Không có dữ liệu ca
      </div>
    `;

    return;

  }


  shifts.forEach(
    shift => {

      const label =
        document.createElement(
          "label"
        );


      label.className =
        "shift-option";


      label.innerHTML = `

        <input
          type="checkbox"
          name="shift"
          value="${esc(shift)}"
          ${
            selectedShifts.includes(
              String(shift)
            )
              ? "checked"
              : ""
          }
        >

        <span>
          Ca ${esc(shift)}
        </span>

      `;


      container.appendChild(
        label
      );

    }
  );

}


/* =====================================================
   UPDATE FILTER UI
===================================================== */

function updateFilterUI() {

  document
    .querySelectorAll(
      'input[name="week"]'
    )
    .forEach(
      input => {

        input.checked =
          selectedWeeks.includes(
            String(
              input.value
            )
          );

      }
    );


  document
    .querySelectorAll(
      'input[name="shift"]'
    )
    .forEach(
      input => {

        input.checked =
          selectedShifts.includes(
            String(
              input.value
            )
          );

      }
    );


  updateWeekDropdownText();

}


/* =====================================================
   ẨN / HIỆN BỘ LỌC
===================================================== */

function updateFilterVisibility() {

  const groups =
    document.querySelectorAll(
      ".schedule-filter .filter-group"
    );


  groups.forEach(
    group => {

      const label =
        group.querySelector(
          ":scope > label"
        );


      if (!label) {
        return;
      }


      const title =
        label.textContent
          .trim()
          .toLowerCase();


      if (
        currentView === "11e3"
      ) {

        group.style.display =
          "none";

        return;

      }


      if (
        title === "tuần học" ||
        title === "ca học"
      ) {

        group.style.display =
          "";

      }

    }
  );

}


/* =====================================================
   BIND DROPDOWN
===================================================== */

function bindWeekDropdown() {

  const button =
    document.getElementById(
      "weekDropdownBtn"
    );


  const dropdown =
    document.querySelector(
      ".week-dropdown"
    );


  if (
    !button ||
    !dropdown
  ) {

    return;

  }


  button.addEventListener(
    "click",
    event => {

      event.stopPropagation();


      dropdown.classList.toggle(
        "open"
      );

    }
  );


  const list =
    document.getElementById(
      "weekDropdownList"
    );


  if (list) {

    list.addEventListener(
      "click",
      event => {

        event.stopPropagation();

      }
    );

  }


  document.addEventListener(
    "click",
    event => {

      if (
        !dropdown.contains(
          event.target
        )
      ) {

        dropdown.classList.remove(
          "open"
        );

      }

    }
  );

}


/* =====================================================
   BIND FILTER
===================================================== */

function bindFilterEvents() {

  document.addEventListener(
    "change",
    event => {

      const input =
        event.target;


      /*
         TUẦN
      */

      if (
        input.matches(
          'input[name="week"]'
        )
      ) {

        if (
          input.checked
        ) {

          document
            .querySelectorAll(
              'input[name="week"]'
            )
            .forEach(
              other => {

                if (
                  other !== input
                ) {

                  other.checked =
                    false;

                }

              }
            );


          selectedWeeks = [
            String(
              input.value
            )
          ];

        }

        else {

          const weeks =
            getAvailableWeeks();


          selectedWeeks =
            weeks.length
              ? [weeks[0]]
              : [];

        }


        updateFilterUI();

        closeWeekDropdown();

        render();

        return;

      }


      /*
         CA
      */

      if (
        input.matches(
          'input[name="shift"]'
        )
      ) {

        if (
          input.checked
        ) {

          document
            .querySelectorAll(
              'input[name="shift"]'
            )
            .forEach(
              other => {

                if (
                  other !== input
                ) {

                  other.checked =
                    false;

                }

              }
            );


          selectedShifts = [
            String(
              input.value
            )
          ];

        }

        else {

          const shifts =
            getAvailableShifts();


          selectedShifts =
            shifts.length
              ? [shifts[0]]
              : [];

        }


        updateFilterUI();

        render();

      }

    }
  );

}


/* =====================================================
   ĐÓNG DROPDOWN
===================================================== */

function closeWeekDropdown() {

  const dropdown =
    document.querySelector(
      ".week-dropdown"
    );


  if (!dropdown) {
    return;
  }


  dropdown.classList.remove(
    "open"
  );

}


/* =====================================================
   STATUS
===================================================== */

function updateStatus() {

  const dot =
    document.getElementById(
      "statusDot"
    );


  const storageStatus =
    document.getElementById(
      "storageStatus"
    );


  const syncStatus =
    document.getElementById(
      "syncStatus"
    );


  const lastSync =
    localStorage.getItem(
      LAST_SYNC_KEY
    );


  const hasData =
    hasSyncedData();


  if (dot) {

    dot.classList.toggle(
      "ok",
      hasData
    );

  }


  if (storageStatus) {

    storageStatus.textContent =
      hasData

        ? "Đang dùng dữ liệu đã đồng bộ và lưu trên trình duyệt"

        : "Chưa có dữ liệu đồng bộ";

  }


  if (syncStatus) {

    syncStatus.textContent =
      hasData

        ? "Dữ liệu đang lấy từ bộ nhớ trình duyệt. Không tự gọi API."

        : "Bấm Đồng bộ dữ liệu để lấy dữ liệu mới.";

  }

}


/* =====================================================
   UPDATE NGÀY ĐỒNG BỘ
===================================================== */

function updateDateText() {

  const el =
    document.getElementById(
      "updatedText"
    );


  if (!el) {
    return;
  }


  const lastSync =
    localStorage.getItem(
      LAST_SYNC_KEY
    );


  el.textContent =
    lastSync
      ? `Đồng bộ gần nhất: ${lastSync}`
      : "Chưa đồng bộ";

}


/* =====================================================
   TOAST
===================================================== */

function toast(message) {

  const el =
    document.getElementById(
      "toast"
    );


  if (!el) {
    return;
  }


  el.textContent =
    message;


  el.classList.add(
    "show"
  );


  clearTimeout(
    window.__tkbToast
  );


  window.__tkbToast =
    setTimeout(
      () => {

        el.classList.remove(
          "show"
        );

      },
      3500
    );

}


/* =====================================================
   THÔNG BÁO LẦN ĐẦU
===================================================== */

function showFirstSyncNotice() {

  if (
    !hasSyncedData()
  ) {

    setTimeout(
      () => {

        toast(
          "📢 Chưa có dữ liệu thời khóa biểu. Vui lòng bấm “Đồng bộ dữ liệu” để tải dữ liệu mới nhất."
        );

      },
      600
    );

  }

}


/* =====================================================
   ĐỒNG BỘ DỮ LIỆU QUA CLOUDFLARE WORKER
===================================================== */

async function syncFromApi() {

  const url =
    DEFAULT_API_URL.trim();


  if (!url) {

    toast(
      "Chưa cấu hình URL Cloudflare Worker."
    );

    return;

  }


  const button =
    document.getElementById(
      "syncBtn"
    );


  if (button) {

    button.disabled =
      true;

    button.textContent =
      "⏳ Đang đồng bộ...";

  }


  try {

    /*
       Không gọi GAS.

       Chỉ gọi Cloudflare Worker.

       Thêm timestamp để tránh cache
       của trình duyệt.
    */

    const separator =
      url.includes("?")
        ? "&"
        : "?";


    const requestUrl =
      url +
      separator +
      "action=getData" +
      "&_=" +
      Date.now();


    console.log(
      "TKB API:",
      requestUrl
    );


    const response =
      await fetch(
        requestUrl,
        {
          method: "GET",

          cache: "no-store",

          headers: {
            Accept:
              "application/json"
          }
        }
      );


    if (
      !response.ok
    ) {

      throw new Error(
        `HTTP ${response.status}`
      );

    }


    const json =
      await response.json();


    console.log(
      "TKB API RESPONSE:",
      json
    );


    /*
       API báo lỗi
    */

    if (
      json &&
      json.success === false
    ) {

      throw new Error(
        json.message ||
        "API trả về lỗi."
      );

    }


    /*
       QUAN TRỌNG:
       Chỉ website chính được FULL.
    */

    if (
      json.fullAccess !== true
    ) {

      throw new Error(
        "Worker không cấp quyền FULL DATA cho website này."
      );

    }


    /*
       Kiểm tra class.
    */

    if (
      !json ||
      !json.class11e3 ||
      !json.class52dt
    ) {

      throw new Error(
        "Dữ liệu không đúng cấu trúc."
      );

    }


    /*
       Kiểm tra danh sách tuần.
    */

    if (
      !Array.isArray(
        json.class52dt.weeks
      )
    ) {

      throw new Error(
        "Dữ liệu 52ĐT không có danh sách tuần."
      );

    }


    /*
       Lưu dữ liệu vào localStorage.
    */

    const saved =
      saveLocalData(
        json
      );


    if (!saved) {

      throw new Error(
        "Không thể lưu dữ liệu."
      );

    }


    /*
       Lưu thời gian đồng bộ.
    */

    const now =
      new Date()
        .toLocaleString(
          "vi-VN"
        );


    localStorage.setItem(
      LAST_SYNC_KEY,
      now
    );


    /*
       Reset filter.
    */

    selectedWeeks = [];

    selectedShifts = [];


    /*
       Lấy tuần + ca
       từ dữ liệu vừa đồng bộ.
    */

    initializeFiltersFromData();


    /*
       Tạo lại bộ lọc.
    */

    ensureWeekCheckboxes();

    ensureShiftCheckboxes();


    /*
       Hiển thị.
    */

    toast(
      "✓ Đồng bộ dữ liệu thành công!"
    );


    render();


  } catch (error) {

    console.error(
      "SYNC ERROR:",
      error
    );


    toast(
      "Đồng bộ thất bại: " +
      (
        error?.message ||
        "Không xác định"
      )
    );


  } finally {

    if (button) {

      button.disabled =
        false;

      button.textContent =
        "↻ Đồng bộ dữ liệu";

    }

  }

}


/* =====================================================
   TEST WORKER
===================================================== */

async function testWorker() {

  const base =
    DEFAULT_API_URL
      .replace(
        /\/api\/tkb\/?$/,
        ""
      );


  const url =
    base +
    "/api/ping?_=" +
    Date.now();


  try {

    const response =
      await fetch(
        url,
        {
          method: "GET",
          cache: "no-store",
          headers: {
            Accept:
              "application/json"
          }
        }
      );


    const json =
      await response.json();


    console.log(
      "WORKER PING:",
      json
    );


    return json;

  } catch (error) {

    console.error(
      "WORKER PING ERROR:",
      error
    );


    return null;

  }

}


/* =====================================================
   TABS
===================================================== */

function bindTabs() {

  document
    .querySelectorAll(
      ".tab"
    )
    .forEach(
      tab => {

        tab.addEventListener(
          "click",
          () => {

            document
              .querySelectorAll(
                ".tab"
              )
              .forEach(
                item =>
                  item.classList.remove(
                    "active"
                  )
              );


            tab.classList.add(
              "active"
            );


            currentView =
              tab.dataset.view ||
              "all";


            render();

          }
        );

      }
    );

}


/* =====================================================
   NÚT ĐỒNG BỘ
===================================================== */

function bindSyncButton() {

  const button =
    document.getElementById(
      "syncBtn"
    );


  if (!button) {
    return;
  }


  button.addEventListener(
    "click",
    syncFromApi
  );

}


/* =====================================================
   NÚT XÓA DỮ LIỆU
===================================================== */

function bindClearButton() {

  const button =
    document.getElementById(
      "clearBtn"
    );


  if (!button) {
    return;
  }


  button.addEventListener(
    "click",
    () => {

      const ok =
        confirm(
          "Xóa dữ liệu TKB đã lưu trên trình duyệt?"
        );


      if (!ok) {
        return;
      }


      localStorage.removeItem(
        STORAGE_KEY
      );


      localStorage.removeItem(
        LAST_SYNC_KEY
      );


      data =
        emptyData();


      selectedWeeks = [];

      selectedShifts = [];


      ensureWeekCheckboxes();

      ensureShiftCheckboxes();


      toast(
        "Đã xóa dữ liệu trên máy. Vui lòng đồng bộ lại."
      );


      render();


      setTimeout(
        () => {

          showFirstSyncNotice();

        },
        400
      );

    }
  );

}


/* =====================================================
   INIT
===================================================== */

function init() {

  /*
     QUAN TRỌNG:

     Nếu localStorage có dữ liệu:
     → dùng local.

     Nếu chưa có:
     → không fetch.
  */

  initializeFiltersFromData();


  /*
     Tạo dropdown tuần.
  */

  ensureWeekCheckboxes();


  /*
     Tạo dropdown ca.
  */

  ensureShiftCheckboxes();


  /*
     Gắn event.
  */

  bindTabs();

  bindSyncButton();

  bindClearButton();

  bindFilterEvents();

  bindWeekDropdown();


  /*
     Render ngay.

     TUYỆT ĐỐI KHÔNG FETCH API.
  */

  render();


  /*
     Thông báo nếu chưa đồng bộ.
  */

  showFirstSyncNotice();

}


/* =====================================================
   START
===================================================== */

init();
