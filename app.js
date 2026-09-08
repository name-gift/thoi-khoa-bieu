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
CHỐNG SPAM
===================================================== */

const SYNC_COOLDOWN = 5000;
const CLEAR_COOLDOWN = 3000;

let syncLocked = false;
let clearLocked = false;

let lastSyncAttempt = 0;
let lastClearAttempt = 0;

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
LOAD LOCAL DATA
===================================================== */

function loadLocalData() {


try {

    const raw =
        localStorage.getItem(
            STORAGE_KEY
        );

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


return String(
    value ?? ""
)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");


}

/* =====================================================
CHUẨN HÓA TEXT CA
=================

Hỗ trợ:

Ca 1
Ca1
CA 1
ca*1
Ca *1
_Ca1
_Ca 1
Ca-1
Ca_1

* Ca 1
  ===================================================== */

function normalizeShiftText(value) {


return String(
    value ?? ""
)
    .replace(
        /_?ca\s*[\*_-]?\s*([0-9]+)/gi,
        "Ca $1"
    )
    .replace(
        /\s*[-–—]\s*Ca\s+([0-9]+)/gi,
        "Ca $1"
    )
    .trim();


}

/* =====================================================
LẤY CA TỪ TEXT
===================================================== */

function getShiftFromText(value) {


const text =
    normalizeShiftText(value);

const match =
    text.match(
        /(?:^|[\s_\-])ca\s*\*?\s*([0-9]+)\b/i
    ) ||
    text.match(
        /\b_ca\s*([0-9]+)\b/i
    );

return match
    ? String(match[1])
    : null;

}

/* =====================================================
LẤY CA TỪ SESSION
===================================================== */

function getSessionShift(session) {


if (!session) {
    return null;
}


/* =================================================
   OBJECT
================================================= */

if (
    typeof session === "object" &&
    !Array.isArray(session)
) {

    const directFields = [

        session.shift,

        session.ca,

        session.shiftId,

        session.caId,

        session.shiftName,

        session.caName
    ];


    for (
        const field of directFields
    ) {

        if (
            field === null ||
            field === undefined
        ) {
            continue;
        }


        const shift =
            getShiftFromText(field);

        if (shift) {
            return shift;
        }


        if (
            /^[0-9]+$/.test(
                String(field).trim()
            )
        ) {

            return String(
                field
            ).trim();
        }
    }


    const text = [

        session.session,

        session.subject,

        session.teacher,

        session.room,

        session.name,

        session.title,

        session.label,

        session.text
    ]
        .filter(
            value =>
                value !== null &&
                value !== undefined &&
                String(value).trim() !== ""
        )
        .join(" ");


    return getShiftFromText(text);
}


/* =================================================
   ARRAY
================================================= */

if (Array.isArray(session)) {

    const directText =
        session
            .filter(
                item =>
                    typeof item !== "object"
            )
            .filter(
                item =>
                    item !== null &&
                    item !== undefined &&
                    String(item).trim() !== ""
            )
            .join(" ");


    const directShift =
        getShiftFromText(
            directText
        );


    if (directShift) {
        return directShift;
    }


    for (
        const item of session
    ) {

        const shift =
            getSessionShift(
                item
            );

        if (shift) {
            return shift;
        }
    }

    return null;
}


return getShiftFromText(
    session
);


}

/* =====================================================
KIỂM TRA SESSION CÓ CA
===================================================== */

function sessionContainsShift(
session,
selectedShift
) {


if (
    !session ||
    !selectedShift
) {
    return false;
}


/* =================================================
   OBJECT
================================================= */

if (
    typeof session === "object" &&
    !Array.isArray(session)
) {

    const shift =
        getSessionShift(
            session
        );


    /*
       Không có ký hiệu Ca
       → cho hiển thị.
    */

    if (!shift) {
        return true;
    }


    return (
        String(shift) ===
        String(selectedShift)
    );
}


/* =================================================
   ARRAY
================================================= */

if (Array.isArray(session)) {

    const isFlatSession =
        session.every(
            item =>
                typeof item !== "object" ||
                item === null
        );


    const directShift =
        getSessionShift(
            session
        );


    /*
       Session phẳng có Ca.
    */

    if (
        isFlatSession &&
        directShift
    ) {

        return (
            String(directShift) ===
            String(selectedShift)
        );
    }


    /*
       Session lồng.
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
       Không có Ca.
    */

    return !directShift;
}


return false;


}

/* =====================================================
XÓA KÝ HIỆU CA KHI HIỂN THỊ
===================================================== */

function cleanShiftText(value) {


return String(
    value ?? ""
)
    .replace(
        /\s*[-–—_]?\s*_?ca\s*[\*_-]?\s*[0-9]+\b/gi,
        ""
    )
    .replace(
        /\s{2,}/g,
        " "
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
        week => {

            if (
                !week ||
                typeof week !== "object"
            ) {

                return null;
            }


            let start =
                Number(
                    week.weekStart
                );

            let end =
                Number(
                    week.weekEnd
                );


            /*
               Chỉ có tuần bắt đầu
               → tuần kết thúc = tuần bắt đầu.
            */

            if (
                Number.isFinite(start) &&
                !Number.isFinite(end)
            ) {

                end =
                    start;
            }


            /*
               Nếu start thiếu nhưng label
               có dạng "Tuần 1", cố gắng lấy số.
            */

            if (
                !Number.isFinite(start)
            ) {

                const text =
                    String(
                        week.label ||
                        ""
                    );

                const match =
                    text.match(
                        /(\d+)(?:\s*-\s*(\d+))?/
                    );


                if (match) {

                    start =
                        Number(
                            match[1]
                        );

                    end =
                        match[2]
                            ? Number(match[2])
                            : start;
                }
            }


            /*
               Nếu end vẫn thiếu.
            */

            if (
                Number.isFinite(start) &&
                !Number.isFinite(end)
            ) {

                end =
                    start;
            }


            /*
               Đảo lại nếu API gửi ngược.
            */

            if (
                Number.isFinite(start) &&
                Number.isFinite(end) &&
                end < start
            ) {

                const temp =
                    start;

                start =
                    end;

                end =
                    temp;
            }


            return {

                ...week,

                weekStart:
                    start,

                weekEnd:
                    end
            };
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
LẤY DANH SÁCH TUẦN
===================================================== */

function getAvailableWeeks() {

const weeks =
    getApiWeeks();

const result = [];


weeks.forEach(
    week => {

        for (
            let w =
                week.weekStart;

            w <=
            week.weekEnd;

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
THU THẬP CA ĐỆ QUY
===================================================== */

function collectSessionShifts(
session,
result
) {


if (
    session === null ||
    session === undefined ||
    session === ""
) {

    return;
}


/* =================================================
   OBJECT
================================================= */

if (
    typeof session === "object" &&
    !Array.isArray(session)
) {

    const shift =
        getSessionShift(
            session
        );


    if (shift) {

        result.add(
            String(shift)
        );
    }


    /*
       Kiểm tra thêm các field
       phòng trường hợp object lồng.
    */

    [
        session.session,
        session.subject,
        session.teacher,
        session.room,
        session.name,
        session.title
    ]
        .filter(Boolean)
        .forEach(
            value => {

                const detected =
                    getShiftFromText(
                        value
                    );

                if (detected) {

                    result.add(
                        String(
                            detected
                        )
                    );
                }
            }
        );


    return;
}


/* =================================================
   ARRAY
================================================= */

if (Array.isArray(session)) {

    const directText =
        session
            .filter(
                item =>
                    typeof item !== "object"
            )
            .filter(
                item =>
                    item !== null &&
                    item !== undefined &&
                    String(item).trim() !== ""
            )
            .join(" ");


    const directShift =
        getShiftFromText(
            directText
        );


    if (directShift) {

        result.add(
            String(
                directShift
            )
        );
    }


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
LẤY CA CỦA TUẦN ĐANG CHỌN
===================================================== */

function getAvailableShifts() {


const shifts =
    new Set();


const weeks =
    getApiWeeks();


const selectedWeek =
    Number(
        getSelectedWeek()
    );


let targetWeeks;


if (
    Number.isFinite(
        selectedWeek
    )
) {

    targetWeeks =
        weeks.filter(
            week =>
                selectedWeek >=
                    week.weekStart &&
                selectedWeek <=
                    week.weekEnd
        );

} else {

    targetWeeks =
        weeks;
}


targetWeeks.forEach(
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
                   sessions[0]
                   = Sáng / Nghề

                   sessions[1]
                   = Chiều / Văn hóa
                */

                const morning =
                    sessions[0];


                if (morning) {

                    collectSessionShifts(
                        morning,
                        shifts
                    );
                }
            }
        );


        /*
           API có thể gửi shifts trực tiếp.
        */

        if (
            Array.isArray(
                week.shifts
            )
        ) {

            week.shifts.forEach(
                shift => {

                    const value =
                        getShiftFromText(
                            shift
                        );


                    if (value) {

                        shifts.add(
                            String(value)
                        );

                    } else if (
                        /^[0-9]+$/.test(
                            String(
                                shift
                            ).trim()
                        )
                    ) {

                        shifts.add(
                            String(
                                shift
                            ).trim()
                        );
                    }
                }
            );
        }
    }
);


/*
   Nếu tuần đang chọn không có
   shifts nhưng API filters có,
   dùng làm fallback.
*/

if (
    !shifts.size &&
    Array.isArray(
        data?.filters?.shifts
    )
) {

    data.filters.shifts.forEach(
        shift => {

            const value =
                getShiftFromText(
                    shift
                );


            if (value) {

                shifts.add(
                    String(value)
                );

            } else if (
                /^[0-9]+$/.test(
                    String(
                        shift
                    ).trim()
                )
            ) {

                shifts.add(
                    String(
                        shift
                    ).trim()
                );
            }
        }
    );
}


return Array.from(
    shifts
).sort(
    (a, b) =>
        Number(a) -
        Number(b)
);


}

/* =====================================================
KIỂM TRA DỮ LIỆU ĐÃ ĐỒNG BỘ
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
KHỞI TẠO TUẦN / CA
===================================================== */

function initializeFiltersFromData() {


if (!hasSyncedData()) {

    selectedWeeks = [];
    selectedShifts = [];

    return;
}


const weeks =
    getAvailableWeeks();


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

const shifts =
    getAvailableShifts();


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


if (!hasSyncedData()) {
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


if (!hasSyncedData()) {
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

function weekMatchesFilter(
week
) {


if (!week) {
    return false;
}


const selected =
    Number(
        getSelectedWeek()
    );


if (
    !Number.isFinite(
        selected
    )
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


if (
    !Number.isFinite(start) ||
    !Number.isFinite(end)
) {

    return false;
}


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


/* =================================================
   OBJECT
================================================= */

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


/* =================================================
   ARRAY
================================================= */

if (Array.isArray(session)) {

    /*
       [room, subject, teacher]
    */

    if (
        session.length >= 3 &&
        !Array.isArray(
            session[0]
        )
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
       [subject, teacher]
    */

    if (
        session.length >= 2 &&
        !Array.isArray(
            session[0]
        )
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
   Session đơn.
*/

if (
    !Array.isArray(session) ||
    (
        session.length &&
        !Array.isArray(
            session[0]
        )
    )
) {

    return renderSingleSession(
        session
    );
}


/*
   Nhiều session:

   [
      [Phòng, Môn, GV - Ca 1],
      [Phòng, Môn, GV - Ca 2]
   ]
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
   Session đơn.
*/

if (
    !Array.isArray(session) ||
    (
        session.length &&
        !Array.isArray(
            session[0]
        )
    )
) {

    return renderSingleSession(
        session
    );
}


/*
   Nhiều session.
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
        DAYS
            .map(
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
                        Array.isArray(
                            session
                        )
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
            )
            .join("");


    rows += `
        <tr>

            <td class="rule">
                ${esc(
                    c.rules?.[i] ||
                    ""
                )}
            </td>

            <td class="time">
                ${esc(
                    period[0]
                )}
                -
                ${esc(
                    period[1]
                )}
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

            ${esc(
                c.homeroom ||
                ""
            )}

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
                        c.subtitle ||
                        ""
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

function weekHasVisibleData(
week
) {


if (!week) {
    return false;
}


for (
    const day of DAYS
) {

    const sessions =
        week.days?.[day] ||
        [];


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

                <b>
                    “Đồng bộ dữ liệu”
                </b>

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
                                                week.days?.[
                                                    day
                                                ]?.[0];


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
                                                week.days?.[
                                                    day
                                                ]?.[1];


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
            Array.isArray(
                c.notes
            ) &&
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


const container =
    document.querySelector(
        ".shift-options, .shift-list"
    );


if (!container) {
    return;
}


container.innerHTML = "";


if (!hasSyncedData()) {

    container.innerHTML = `
        <div class="shift-empty">
            Chưa có dữ liệu ca
        </div>
    `;

    return;
}


const shifts =
    getAvailableShifts();


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


        /* =========================================
           TUẦN
        ========================================= */

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
                                other !==
                                input
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


            /*
               Đổi tuần
               → lấy lại Ca của tuần.
            */

            const availableShifts =
                getAvailableShifts();


            if (
                !availableShifts.includes(
                    String(
                        getSelectedShift()
                    )
                )
            ) {

                selectedShifts =
                    availableShifts.length
                        ? [
                            availableShifts[0]
                        ]
                        : [];
            }


            ensureShiftCheckboxes();

            updateFilterUI();

            closeWeekDropdown();

            render();

            return;
        }


        /* =========================================
           CA
        ========================================= */

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
                                other !==
                                input
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
ĐẾM NGƯỢC NÚT ĐỒNG BỘ
===================================================== */

function startSyncCooldown(
button
) {


const end =
    Date.now() +
    SYNC_COOLDOWN;


const originalText =
    "↻ Đồng bộ dữ liệu";


syncLocked =
    true;


if (button) {

    button.disabled =
        true;
}


const timer =
    setInterval(
        () => {

            const remaining =
                Math.max(
                    0,
                    end -
                    Date.now()
                );


            if (
                remaining <= 0
            ) {

                clearInterval(
                    timer
                );


                syncLocked =
                    false;


                if (button) {

                    button.disabled =
                        false;

                    button.textContent =
                        originalText;
                }


                return;
            }


            const seconds =
                Math.ceil(
                    remaining /
                    1000
                );


            if (button) {

                button.textContent =
                    `⏳ Chờ ${seconds}s...`;
            }

        },
        250
    );


}

/* =====================================================
CHỐNG SPAM ĐỒNG BỘ
===================================================== */

function canSyncNow() {


const now =
    Date.now();


if (syncLocked) {

    toast(
        "⏳ Đang xử lý, vui lòng chờ..."
    );

    return false;
}


if (
    now -
    lastSyncAttempt <
    SYNC_COOLDOWN
) {

    const seconds =
        Math.ceil(
            (
                SYNC_COOLDOWN -
                (
                    now -
                    lastSyncAttempt
                )
            ) / 1000
        );


    toast(
        `⏳ Vui lòng chờ ${seconds}s rồi đồng bộ lại.`
    );

    return false;
}


lastSyncAttempt =
    now;


return true;


}

/* =====================================================
ĐỒNG BỘ DỮ LIỆU
===================================================== */

async function syncFromApi() {


if (
    !canSyncNow()
) {
    return;
}


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


syncLocked =
    true;


if (button) {

    button.disabled =
        true;

    button.textContent =
        "⏳ Đang đồng bộ...";
}


try {

    /*
       Chỉ gọi Cloudflare Worker.
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

                cache:
                    "no-store",

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
       API báo lỗi.
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
       Website chính phải có FULL.
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
       Kiểm tra weeks.
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
       Chuẩn hóa tuần.
    */

    json.class52dt.weeks =
        json.class52dt.weeks
            .map(
                week => {

                    if (
                        !week ||
                        typeof week !==
                        "object"
                    ) {

                        return null;
                    }


                    let start =
                        Number(
                            week.weekStart
                        );

                    let end =
                        Number(
                            week.weekEnd
                        );


                    /*
                       Lấy tuần từ label
                       nếu thiếu weekStart.
                    */

                    if (
                        !Number.isFinite(
                            start
                        )
                    ) {

                        const text =
                            String(
                                week.label ||
                                ""
                            );


                        const match =
                            text.match(
                                /(\d+)(?:\s*-\s*(\d+))?/
                            );


                        if (match) {

                            start =
                                Number(
                                    match[1]
                                );

                            end =
                                match[2]
                                    ? Number(
                                        match[2]
                                    )
                                    : start;
                        }
                    }


                    /*
                       Chỉ có tuần bắt đầu
                       → kết thúc = bắt đầu.
                    */

                    if (
                        Number.isFinite(
                            start
                        ) &&
                        !Number.isFinite(
                            end
                        )
                    ) {

                        end =
                            start;
                    }


                    /*
                       Đảo nếu ngược.
                    */

                    if (
                        Number.isFinite(
                            start
                        ) &&
                        Number.isFinite(
                            end
                        ) &&
                        end < start
                    ) {

                        const temp =
                            start;

                        start =
                            end;

                        end =
                            temp;
                    }


                    return {

                        ...week,

                        weekStart:
                            start,

                        weekEnd:
                            end
                    };
                }
            )
            .filter(
                week =>
                    week &&
                    Number.isFinite(
                        Number(
                            week.weekStart
                        )
                    ) &&
                    Number.isFinite(
                        Number(
                            week.weekEnd
                        )
                    )
            );


    /*
       Lưu dữ liệu.
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
       Lưu thời gian.
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
       Khởi tạo lại.
    */

    initializeFiltersFromData();


    /*
       Tạo dropdown.
    */

    ensureWeekCheckboxes();

    ensureShiftCheckboxes();


    /*
       Kiểm tra Ca.
    */

    const detectedShifts =
        getAvailableShifts();


    console.log(
        "CA ĐÃ PHÁT HIỆN:",
        detectedShifts
    );


    if (
        detectedShifts.length
    ) {

        toast(
            `✓ Đồng bộ thành công! Đã tìm thấy ${detectedShifts
                .map(
                    shift =>
                        `Ca ${shift}`
                )
                .join(" và ")}.`
        );

    } else {

        toast(
            "✓ Đồng bộ thành công nhưng dữ liệu buổi sáng chưa có ký hiệu Ca 1/Ca 2."
        );
    }


    /*
       Render.
    */

    render();


    /*
       Chống spam.
    */

    startSyncCooldown(
        button
    );


} catch (error) {

    console.error(
        "SYNC ERROR:",
        error
    );


    toast(
        "❌ Đồng bộ thất bại: " +
        (
            error?.message ||
            "Không xác định"
        )
    );


    /*
       Vẫn khóa 5 giây.
    */

    startSyncCooldown(
        button
    );
}


}

/* =====================================================
TEST WORKER
===================================================== */

async function testWorker() {


try {

    const workerUrl =
        new URL(
            DEFAULT_API_URL
        );


    const url =
        workerUrl.origin +
        "/api/ping?_=" +
        Date.now();


    const response =
        await fetch(
            url,
            {
                method: "GET",

                cache:
                    "no-store",

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
    event => {

        event.preventDefault();

        event.stopPropagation();


        if (
            syncLocked
        ) {

            toast(
                "⏳ Đang xử lý, vui lòng chờ..."
            );

            return;
        }


        syncFromApi();
    }
);


}

/* =====================================================
MODAL XÓA DỮ LIỆU
===================================================== */

function injectDeleteModalCSS() {


if (
    document.getElementById(
        "tkbDeleteModalStyle"
    )
) {
    return;
}


const style =
    document.createElement(
        "style"
    );


style.id =
    "tkbDeleteModalStyle";


style.textContent = `

    #tkbDeleteModal {

        position: fixed;

        inset: 0;

        z-index: 999999;

        display: flex;

        align-items: center;

        justify-content: center;

        padding: 20px;

        opacity: 0;

        visibility: hidden;

        transition:
            opacity .2s ease,
            visibility .2s ease;
    }


    #tkbDeleteModal.show {

        opacity: 1;

        visibility: visible;
    }


    .tkb-delete-backdrop {

        position: absolute;

        inset: 0;

        background:
            rgba(0, 0, 0, .72);

        backdrop-filter:
            blur(9px);

        -webkit-backdrop-filter:
            blur(9px);
    }


    .tkb-delete-box {

        position: relative;

        width: min(
            420px,
            100%
        );

        padding:
            28px 24px 22px;

        background:
            linear-gradient(
                145deg,
                rgba(30, 36, 51, .98),
                rgba(13, 17, 27, .99)
            );

        border:
            1px solid
            rgba(255,255,255,.09);

        border-radius:
            22px;

        box-shadow:
            0 30px 80px
            rgba(0,0,0,.6),

            0 0 0 1px
            rgba(255,255,255,.02);

        text-align: center;

        transform:
            translateY(18px)
            scale(.96);

        transition:
            transform .22s ease;
    }


    #tkbDeleteModal.show
    .tkb-delete-box {

        transform:
            translateY(0)
            scale(1);
    }


    .tkb-delete-icon {

        width: 66px;

        height: 66px;

        margin:
            0 auto 17px;

        display: flex;

        align-items: center;

        justify-content: center;

        border-radius: 50%;

        background:
            rgba(255, 174, 0, .11);

        border:
            1px solid
            rgba(255, 174, 0, .24);

        font-size: 31px;

        box-shadow:
            0 0 30px
            rgba(255, 174, 0, .08);
    }


    .tkb-delete-box h3 {

        margin:
            0 0 9px;

        color: #fff;

        font-size: 21px;

        font-weight: 750;
    }


    .tkb-delete-box p {

        margin:
            6px 0;

        color:
            rgba(255,255,255,.68);

        font-size: 14px;

        line-height: 1.55;
    }


    .tkb-delete-warning {

        margin-top: 14px !important;

        padding:
            11px 12px;

        border-radius:
            11px;

        background:
            rgba(255,174,0,.065);

        border:
            1px solid
            rgba(255,174,0,.12);

        color:
            rgba(255, 202, 112, .92) !important;

        font-size:
            13px !important;
    }


    .tkb-delete-actions {

        display: flex;

        gap: 10px;

        margin-top: 22px;
    }


    .tkb-delete-actions button {

        flex: 1;

        min-height: 45px;

        border: 0;

        border-radius: 12px;

        padding:
            0 15px;

        font-family: inherit;

        font-size: 14px;

        font-weight: 650;

        cursor: pointer;

        transition:
            transform .15s ease,
            opacity .15s ease,
            background .15s ease;
    }


    .tkb-delete-actions button:hover {

        transform:
            translateY(-1px);
    }


    .tkb-delete-actions button:active {

        transform:
            scale(.97);
    }


    .tkb-delete-cancel {

        color:
            rgba(255,255,255,.88);

        background:
            rgba(255,255,255,.075);

        border:
            1px solid
            rgba(255,255,255,.08) !important;
    }


    .tkb-delete-cancel:hover {

        background:
            rgba(255,255,255,.12);
    }


    .tkb-delete-confirm {

        color: #fff;

        background:
            linear-gradient(
                135deg,
                #ef4444,
                #dc2626
            );

        box-shadow:
            0 8px 22px
            rgba(220,38,38,.2);
    }


    .tkb-delete-confirm:hover {

        opacity: .92;
    }


    @media (
        max-width: 480px
    ) {

        .tkb-delete-box {

            padding:
                24px 18px 18px;

            border-radius:
                19px;
        }


        .tkb-delete-actions {

            flex-direction:
                column-reverse;
        }


        .tkb-delete-actions button {

            width: 100%;
        }
    }

`;


document.head.appendChild(
    style
);


}

/* =====================================================
HIỂN THỊ MODAL XÓA
===================================================== */

function showDeleteConfirm() {


injectDeleteModalCSS();


return new Promise(
    resolve => {

        const old =
            document.getElementById(
                "tkbDeleteModal"
            );


        if (old) {
            old.remove();
        }


        const modal =
            document.createElement(
                "div"
            );


        modal.id =
            "tkbDeleteModal";


        modal.innerHTML = `

            <div
                class="tkb-delete-backdrop"
            ></div>


            <div
                class="tkb-delete-box"
                role="dialog"
                aria-modal="true"
                aria-labelledby="tkbDeleteTitle"
            >

                <div
                    class="tkb-delete-icon"
                >
                    ⚠️
                </div>


                <h3
                    id="tkbDeleteTitle"
                >
                    Xóa dữ liệu TKB?
                </h3>


                <p>
                    Dữ liệu thời khóa biểu
                    đang lưu trên trình duyệt
                    sẽ được xóa.
                </p>


                <p class="tkb-delete-warning">
                    Dữ liệu trên máy chủ
                    không bị ảnh hưởng.
                    Muốn xem lại dữ liệu,
                    em chỉ cần đồng bộ lại.
                </p>


                <div
                    class="tkb-delete-actions"
                >

                    <button
                        type="button"
                        class="tkb-delete-cancel"
                        id="tkbDeleteCancel"
                    >
                        Hủy
                    </button>


                    <button
                        type="button"
                        class="tkb-delete-confirm"
                        id="tkbDeleteConfirm"
                    >
                        🗑 Xóa dữ liệu
                    </button>

                </div>

            </div>
        `;


        document.body.appendChild(
            modal
        );


        let finished =
            false;


        const finish =
            result => {

                if (finished) {
                    return;
                }


                finished = true;


                modal.classList.remove(
                    "show"
                );


                setTimeout(
                    () => {

                        modal.remove();

                        resolve(
                            result
                        );

                    },
                    180
                );
            };


        modal
            .querySelector(
                "#tkbDeleteCancel"
            )
            .addEventListener(
                "click",
                () => {

                    finish(false);
                }
            );


        modal
            .querySelector(
                "#tkbDeleteConfirm"
            )
            .addEventListener(
                "click",
                () => {

                    finish(true);
                }
            );


        modal
            .querySelector(
                ".tkb-delete-backdrop"
            )
            .addEventListener(
                "click",
                () => {

                    finish(false);
                }
            );


        const keyHandler =
            event => {

                if (
                    event.key ===
                    "Escape"
                ) {

                    document.removeEventListener(
                        "keydown",
                        keyHandler
                    );


                    finish(false);
                }
            };


        document.addEventListener(
            "keydown",
            keyHandler
        );


        requestAnimationFrame(
            () => {

                modal.classList.add(
                    "show"
                );
            }
        );
    }
);


}

/* =====================================================
KIỂM TRA CHỐNG SPAM XÓA
===================================================== */

function canClearNow() {


const now =
    Date.now();


if (clearLocked) {

    toast(
        "⏳ Thao tác xóa đang được xử lý. Vui lòng chờ."
    );

    return false;
}


if (
    now -
    lastClearAttempt <
    CLEAR_COOLDOWN
) {

    const seconds =
        Math.ceil(
            (
                CLEAR_COOLDOWN -
                (
                    now -
                    lastClearAttempt
                )
            ) / 1000
        );


    toast(
        `⏳ Vui lòng chờ ${seconds}s rồi xóa lại.`
    );

    return false;
}


lastClearAttempt =
    now;


return true;


}

/* =====================================================
KHÓA NÚT XÓA
===================================================== */

function startClearCooldown(
button
) {

clearLocked =
    true;


if (button) {

    button.disabled =
        true;
}


setTimeout(
    () => {

        clearLocked =
            false;


        if (button) {

            button.disabled =
                false;

            button.textContent =
                "🗑 Xóa dữ liệu";
        }

    },
    CLEAR_COOLDOWN
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
    async event => {

        event.preventDefault();

        event.stopPropagation();


        if (
            !canClearNow()
        ) {

            return;
        }


        /*
           Modal đẹp thay confirm().
        */

        const confirmed =
            await showDeleteConfirm();


        if (!confirmed) {

            toast(
                "Đã hủy thao tác xóa dữ liệu."
            );


            /*
               Hủy thì cho phép bấm lại ngay.
            */

            lastClearAttempt =
                0;


            return;
        }


        clearLocked =
            true;


        button.disabled =
            true;


        button.textContent =
            "⏳ Đang xóa...";


        try {

            /*
               Chỉ xóa Local Storage.

               KHÔNG đụng Google Sheet.
            */

            localStorage.removeItem(
                STORAGE_KEY
            );


            localStorage.removeItem(
                LAST_SYNC_KEY
            );


            /*
               Reset data.
            */

            data =
                emptyData();


            selectedWeeks = [];

            selectedShifts = [];


            /*
               Tạo lại filter.
            */

            ensureWeekCheckboxes();

            ensureShiftCheckboxes();


            /*
               Render.
            */

            render();


            /*
               Thông báo.
            */

            toast(
                "🗑️ Đã xóa dữ liệu TKB trên trình duyệt."
            );


            /*
               Nhắc đồng bộ lại.
            */

            setTimeout(
                () => {

                    if (
                        !hasSyncedData()
                    ) {

                        toast(
                            "📢 Dữ liệu đã được xóa. Bấm “Đồng bộ dữ liệu” để tải lại."
                        );
                    }

                },
                1800
            );


        } catch (error) {

            console.error(
                "CLEAR DATA ERROR:",
                error
            );


            toast(
                "❌ Không thể xóa dữ liệu trên trình duyệt."
            );

        } finally {

            /*
               Khóa 3 giây.
            */

            startClearCooldown(
                button
            );
        }
    }
);


}

/* =====================================================
INIT
===================================================== */

function init() {


/*
   Nếu có Local Storage:
   → dùng dữ liệu local.

   Nếu chưa có:
   → KHÔNG FETCH.
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
   Thông báo lần đầu.
*/

showFirstSyncNotice();

}

/* =====================================================
START
===================================================== */

init();