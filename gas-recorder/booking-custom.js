/**
 * 独自予約: Googleカレンダーの空き → JSONP / 予約確定 → スプシ + Slack
 *
 * スクリプトプロパティ（任意）:
 *   BOOKING_CALENDAR_ID … 空き判定・予定作成に使うカレンダーID（未設定=デフォルト）
 *   BOOKING_SLOT_MINUTES … 枠の長さ（分）既定 15
 *   BOOKING_START_HOUR … 開始時刻 既定 9
 *   BOOKING_END_HOUR … 終了時刻 既定 18
 *   BOOKING_LEAD_HOURS … 何時間後から予約可 既定 2
 *   BOOKING_DAYS_AHEAD … 何日先まで表示 既定 14
 */

function bookingConfig() {
  var p = PropertiesService.getScriptProperties();
  return {
    calendarId: p.getProperty("BOOKING_CALENDAR_ID") || "",
    slotMinutes: parseInt(p.getProperty("BOOKING_SLOT_MINUTES") || "15", 10),
    startHour: parseInt(p.getProperty("BOOKING_START_HOUR") || "9", 10),
    endHour: parseInt(p.getProperty("BOOKING_END_HOUR") || "18", 10),
    leadHours: parseInt(p.getProperty("BOOKING_LEAD_HOURS") || "2", 10),
    daysAhead: parseInt(p.getProperty("BOOKING_DAYS_AHEAD") || "14", 10)
  };
}

function getBookingCalendar() {
  var cfg = bookingConfig();
  var id = String(cfg.calendarId || "").trim();
  if (id) {
    var byId = CalendarApp.getCalendarById(id);
    if (byId) return byId;
    throw new Error(
      "BOOKING_CALENDAR_ID が無効です: " +
        id +
        " （getBookingCalendarInfo の calendar_id を設定してください）"
    );
  }
  var def = CalendarApp.getDefaultCalendar();
  if (!def) throw new Error("デフォルトカレンダーが取得できません");
  return def;
}

function jsonpResponse(callback, payload) {
  var safeCb = String(callback || "").replace(/[^\w$.]/g, "");
  if (!safeCb) return jsonOk(payload);
  return ContentService.createTextOutput(safeCb + "(" + JSON.stringify(payload) + ");")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function parseIsoToDate(iso) {
  var s = String(iso || "").trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    return new Date(
      parseInt(m[1], 10),
      parseInt(m[2], 10) - 1,
      parseInt(m[3], 10),
      parseInt(m[4], 10),
      parseInt(m[5], 10),
      parseInt(m[6], 10)
    );
  }
  var d = new Date(s);
  if (isNaN(d.getTime())) throw new Error("invalid datetime: " + s);
  return d;
}

function mergeRequestParams(e, params) {
  params = params || {};
  if (e && e.parameter) {
    for (var k in e.parameter) {
      if (!e.parameter.hasOwnProperty(k)) continue;
      if (k === "action" || k === "callback") continue;
      params[k] = e.parameter[k];
    }
  }
  if (e && e.postData && e.postData.contents) {
    var raw = String(e.postData.contents);
    if (raw.charAt(0) !== "{") {
      raw.split("&").forEach(function (pair) {
        var idx = pair.indexOf("=");
        if (idx === -1) return;
        var key = decodeURIComponent(pair.slice(0, idx).replace(/\+/g, " "));
        var val = decodeURIComponent(pair.slice(idx + 1).replace(/\+/g, " "));
        if (key && params[key] === undefined) params[key] = val;
      });
    }
  }
  return params;
}

function formatSlotLabel(d) {
  return Utilities.formatDate(d, TZ, "HH:mm");
}

function formatDayKey(d) {
  return Utilities.formatDate(d, TZ, "yyyy-MM-dd");
}

function formatDayLabel(d) {
  var w = ["日", "月", "火", "水", "木", "金", "土"];
  return Utilities.formatDate(d, TZ, "M/d") + "（" + w[d.getDay()] + "）";
}

function isWorkday(d) {
  var day = d.getDay();
  return day >= 1 && day <= 5;
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function getBusyRanges(cal, rangeStart, rangeEnd) {
  var events = cal.getEvents(rangeStart, rangeEnd);
  var busy = [];
  for (var i = 0; i < events.length; i++) {
    busy.push({
      start: events[i].getStartTime(),
      end: events[i].getEndTime()
    });
  }
  return busy;
}

function isSlotFree(slotStart, slotEnd, busy) {
  for (var i = 0; i < busy.length; i++) {
    if (rangesOverlap(slotStart, slotEnd, busy[i].start, busy[i].end)) {
      return false;
    }
  }
  return true;
}

var BOOKING_SLOTS_CACHE_PREFIX = "booking_slots_v1_";

function bookingSlotsCacheKey(days) {
  return BOOKING_SLOTS_CACHE_PREFIX + days;
}

function readBookingSlotsCache(days) {
  var raw = CacheService.getScriptCache().get(bookingSlotsCacheKey(days));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function writeBookingSlotsCache(days, payload) {
  CacheService.getScriptCache().put(
    bookingSlotsCacheKey(days),
    JSON.stringify(payload),
    180
  );
}

function clearBookingSlotsCache() {
  var cache = CacheService.getScriptCache();
  [3, 5, 7, 14].forEach(function (d) {
    cache.remove(bookingSlotsCacheKey(d));
  });
}

function buildSlotsPayload(days) {
  return {
    ok: true,
    slots: getAvailableSlots(days),
    timezone: TZ,
    slot_minutes: bookingConfig().slotMinutes,
    generated_at: Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX")
  };
}

function getAvailableSlots(daysAhead) {
  var cfg = bookingConfig();
  var cal = getBookingCalendar();
  if (!cal) throw new Error("calendar not found");

  var now = new Date();
  var earliest = new Date(now.getTime() + cfg.leadHours * 60 * 60 * 1000);
  var rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var rangeEnd = new Date(rangeStart.getTime() + (daysAhead + 1) * 24 * 60 * 60 * 1000);
  var busy = getBusyRanges(cal, rangeStart, rangeEnd);

  var slots = [];
  var slotMs = cfg.slotMinutes * 60 * 1000;

  for (var d = 0; d < daysAhead; d++) {
    var day = new Date(rangeStart.getTime() + d * 24 * 60 * 60 * 1000);
    if (!isWorkday(day)) continue;

    for (var h = cfg.startHour; h < cfg.endHour; h++) {
      for (var m = 0; m < 60; m += cfg.slotMinutes) {
        var slotStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0);
        var slotEnd = new Date(slotStart.getTime() + slotMs);
        if (slotEnd.getHours() > cfg.endHour || (slotEnd.getHours() === cfg.endHour && slotEnd.getMinutes() > 0)) {
          continue;
        }
        if (slotStart < earliest) continue;
        if (!isSlotFree(slotStart, slotEnd, busy)) continue;

        slots.push({
          start: Utilities.formatDate(slotStart, TZ, "yyyy-MM-dd'T'HH:mm:ss"),
          end: Utilities.formatDate(slotEnd, TZ, "yyyy-MM-dd'T'HH:mm:ss"),
          day: formatDayKey(slotStart),
          day_label: formatDayLabel(slotStart),
          time_label: formatSlotLabel(slotStart)
        });
      }
    }
  }

  return slots;
}

function handleSlotsRequest(e) {
  try {
    var days = parseInt((e && e.parameter && e.parameter.days) || bookingConfig().daysAhead, 10);
    if (isNaN(days) || days < 1) days = 5;
    if (days > 14) days = 14;

    var payload = readBookingSlotsCache(days);
    if (!payload || !payload.slots) {
      payload = buildSlotsPayload(days);
      writeBookingSlotsCache(days, payload);
    }

    if (e && e.parameter && e.parameter.callback) {
      return jsonpResponse(e.parameter.callback, payload);
    }
    return jsonOk(payload);
  } catch (err) {
    var errPayload = { ok: false, error: String(err) };
    if (e && e.parameter && e.parameter.callback) {
      return jsonpResponse(e.parameter.callback, errPayload);
    }
    return jsonError(err);
  }
}

/**
 * 時間主導トリガー用（5分ごと推奨）— CacheService を温める
 * GASエディタ: トリガー → warmBookingSlotsCache → 分ベース 5
 */
function warmBookingSlotsCache() {
  var daysList = [5, 7];
  daysList.forEach(function (days) {
    var payload = buildSlotsPayload(days);
    writeBookingSlotsCache(days, payload);
  });
  return { ok: true, warmed: daysList };
}

/** GASエディタから1回実行 → カレンダー権限の承認 */
function testBookingSlots() {
  var slots = getAvailableSlots(3);
  Logger.log("slots: " + slots.length);
  return slots.length;
}

/**
 * GASエディタで1回実行 → 予約を入れるカレンダーの ID をログに出す。
 * 別カレンダーを使うときは表示された calendar_id を
 * スクリプトプロパティ BOOKING_CALENDAR_ID にそのまま貼る。
 */
function getBookingCalendarInfo() {
  var cfg = bookingConfig();
  var cal = getBookingCalendar();
  if (!cal) {
    Logger.log("カレンダーが見つかりません。BOOKING_CALENDAR_ID を確認してください。");
    return { ok: false };
  }
  var info = {
    ok: true,
    calendar_name: cal.getName(),
    calendar_id: cal.getId(),
    timezone: cal.getTimeZone(),
    configured_property: cfg.calendarId || "(未設定 → デフォルトカレンダー)",
    note:
      "予約確定時はこのカレンダーに自動で予定が入ります。別カレンダーなら BOOKING_CALENDAR_ID に calendar_id を設定。"
  };
  Logger.log(JSON.stringify(info, null, 2));
  return info;
}

/** 予約確定の本体（カレンダー作成 → スプシ/Slack） */
function bookSlotCore(params) {
  var startIso = params.calendar_start || params.slot_start;
  var endIso = params.calendar_end || params.slot_end;
  if (!startIso || !endIso) throw new Error("missing slot");

  var slotStart = parseIsoToDate(startIso);
  var slotEnd = parseIsoToDate(endIso);
  var cal = getBookingCalendar();

  var busy = getBusyRanges(cal, slotStart, new Date(slotEnd.getTime() + 60000));
  if (!isSlotFree(slotStart, slotEnd, busy)) {
    throw new Error("slot_taken");
  }

  var name = params.calendar_guest_name || params["guest_name"] || "";
  var tel = params["your-tel"] || "";
  var lp = params["_lp"] || params["lp_id"] || "thanks";
  var title = "【LP面談】" + (name || "お問い合わせ") + (tel ? " " + tel : "");
  var desc = [
    "予約元: LPサンクス（独自予約）",
    "電話: " + tel,
    "LP: " + lp
  ].join("\n");

  var event = cal.createEvent(title, slotStart, slotEnd, {
    description: desc
  });

  params._event = "calendar_booked";
  params.calendar_event_id = event.getId();
  params.calendar_id = cal.getId();
  params.calendar_tool = "独自予約";
  params.calendar_booked_at = toJst(new Date());
  params.calendar_start = toJst(slotStart);
  params.calendar_end = toJst(slotEnd);
  params.calendar_guest_name = name;

  clearBookingSlotsCache();

  var sheetResult = handleCalendarBooked(params);
  var sheetJson = JSON.parse(sheetResult.getContent());
  return {
    calendar_id: cal.getId(),
    calendar_name: cal.getName(),
    calendar_event_id: event.getId(),
    calendar_start: params.calendar_start,
    calendar_end: params.calendar_end,
    sheet: sheetJson
  };
}

function handleBookSlot(params) {
  try {
    return jsonOk(bookSlotCore(params));
  } catch (err) {
    return jsonError(err);
  }
}

/**
 * doGet ?action=book … ブラウザから JSONP で予約（POSTリダイレクトで本文が消える問題の回避）
 */
function handleBookRequest(e) {
  try {
    var params = mergeRequestParams(e, {});
    params._event = params._event || "book_slot";
    var payload = bookSlotCore(params);
    payload.ok = true;
    if (e && e.parameter && e.parameter.callback) {
      return jsonpResponse(e.parameter.callback, payload);
    }
    return jsonOk(payload);
  } catch (err) {
    var errPayload = { ok: false, error: String(err) };
    if (e && e.parameter && e.parameter.callback) {
      return jsonpResponse(e.parameter.callback, errPayload);
    }
    return jsonError(err);
  }
}

/** GASエディタでテスト予約（自分のカレンダーに1件入る） */
function testBookSlot() {
  var cal = getBookingCalendar();
  var slots = getAvailableSlots(3);
  if (!slots.length) {
    Logger.log("空き枠なし");
    return null;
  }
  var s = slots[0];
  var out = bookSlotCore({
    calendar_start: s.start,
    calendar_end: s.end,
    calendar_guest_name: "GASテスト",
    "your-tel": "09000000000",
    _lp: "gas_test"
  });
  Logger.log(
    JSON.stringify(
      {
        calendar_name: cal.getName(),
        calendar_id: cal.getId(),
        booked: out
      },
      null,
      2
    )
  );
  return out;
}
