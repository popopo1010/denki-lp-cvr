/**
 * 独自予約: Googleカレンダーの空き → JSONP / 予約確定 → スプシ + Slack
 *
 * スクリプトプロパティ（任意）:
 *   BOOKING_CALENDAR_ID … 単一カレンダー（BOOKING_STAFF_JSON 未設定時）
 *   BOOKING_STAFF_JSON … 担当複数 [{id,name,calendar_id},...] 空きマージ＋RR割当
 *   BOOKING_SLOT_MINUTES … 枠の長さ（分）既定 15
 *   BOOKING_START_HOUR … 開始時刻 既定 9
 *   BOOKING_END_HOUR … 終了の上限（24=23:45枠まで）既定 24
 *   BOOKING_ALLOW_OVERLAP … true=既存予定と重複OK（既定 true）
 *   BOOKING_LEAD_HOURS … 何時間後から予約可 既定 2
 *   BOOKING_DAYS_AHEAD … 何日先まで表示 既定 14
 */

function bookingConfig() {
  var p = PropertiesService.getScriptProperties();
  return {
    calendarId: p.getProperty("BOOKING_CALENDAR_ID") || "",
    slotMinutes: parseInt(p.getProperty("BOOKING_SLOT_MINUTES") || "15", 10),
    startHour: parseInt(p.getProperty("BOOKING_START_HOUR") || "9", 10),
    endHour: parseInt(p.getProperty("BOOKING_END_HOUR") || "24", 10),
    allowOverlap:
      String(p.getProperty("BOOKING_ALLOW_OVERLAP") || "true").toLowerCase() !==
      "false",
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

/** @returns {{id:string,name:string,calendar_id:string}[]} */
function getBookingStaffList() {
  var p = PropertiesService.getScriptProperties();
  var raw = String(p.getProperty("BOOKING_STAFF_JSON") || "").trim();
  if (raw) {
    try {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        var out = [];
        for (var i = 0; i < parsed.length; i++) {
          var row = parsed[i];
          if (!row) continue;
          var calendarId = String(row.calendar_id || "").trim();
          if (!calendarId) continue;
          var cal = CalendarApp.getCalendarById(calendarId);
          if (!cal) continue;
          out.push({
            id: String(row.id || "staff_" + i).trim(),
            name: String(row.name || row.id || "担当").trim(),
            calendar_id: calendarId,
            slack_user_id: String(row.slack_user_id || "").trim()
          });
        }
        if (out.length) return out;
      }
    } catch (e) {
      throw new Error("BOOKING_STAFF_JSON の JSON が不正です: " + e);
    }
  }
  var cal = getBookingCalendar();
  return [
    {
      id: "default",
      name: "担当",
      calendar_id: cal.getId()
    }
  ];
}

function getCalendarForStaff(staff) {
  var cal = CalendarApp.getCalendarById(staff.calendar_id);
  if (!cal) {
    throw new Error("calendar not found: " + staff.calendar_id);
  }
  return cal;
}

function getStaffBusyMap(staffList, rangeStart, rangeEnd) {
  var map = {};
  for (var i = 0; i < staffList.length; i++) {
    var staff = staffList[i];
    map[staff.id] = getBusyRanges(getCalendarForStaff(staff), rangeStart, rangeEnd);
  }
  return map;
}

function staffAllIds(staffList) {
  var ids = [];
  for (var i = 0; i < staffList.length; i++) ids.push(staffList[i].id);
  return ids;
}

function staffFreeAtSlot(staffList, busyMap, slotStart, slotEnd, cfg) {
  if (cfg && cfg.allowOverlap) return staffAllIds(staffList);
  var ids = [];
  for (var i = 0; i < staffList.length; i++) {
    var staff = staffList[i];
    if (isSlotFree(slotStart, slotEnd, busyMap[staff.id])) {
      ids.push(staff.id);
    }
  }
  return ids;
}

/** その日の予約可能時間帯（endHour=24 なら 翌0:00 まで） */
function getDayBookingWindow(day, cfg) {
  var dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), cfg.startHour, 0, 0);
  var dayEnd;
  if (cfg.endHour >= 24) {
    dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 0, 0, 0);
  } else {
    dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), cfg.endHour, 0, 0);
  }
  return { dayStart: dayStart, dayEnd: dayEnd };
}

function pickStaffRoundRobin(staffIds) {
  if (!staffIds || !staffIds.length) {
    throw new Error("no_staff_available");
  }
  if (staffIds.length === 1) return staffIds[0];
  var sorted = staffIds.slice().sort();
  var p = PropertiesService.getScriptProperties();
  var key = "BOOKING_RR_CURSOR";
  var cursor = parseInt(p.getProperty(key) || "0", 10);
  if (isNaN(cursor) || cursor < 0) cursor = 0;
  var pick = sorted[cursor % sorted.length];
  p.setProperty(key, String((cursor + 1) % 1000000));
  return pick;
}

function findStaffById(staffList, staffId) {
  for (var i = 0; i < staffList.length; i++) {
    if (staffList[i].id === staffId) return staffList[i];
  }
  return null;
}

function resolveStaffForBooking(params, slotStart, slotEnd) {
  var cfg = bookingConfig();
  var staffList = getBookingStaffList();
  var busyMap = null;
  if (!cfg.allowOverlap) {
    busyMap = getStaffBusyMap(
      staffList,
      slotStart,
      new Date(slotEnd.getTime() + 60000)
    );
  }
  var explicit = String(params.calendar_staff_id || "").trim();
  if (explicit) {
    var chosen = findStaffById(staffList, explicit);
    if (!chosen) throw new Error("invalid_staff");
    if (
      !cfg.allowOverlap &&
      !isSlotFree(slotStart, slotEnd, busyMap[chosen.id])
    ) {
      throw new Error("slot_taken");
    }
    return chosen;
  }
  var freeIds = staffFreeAtSlot(staffList, busyMap, slotStart, slotEnd, cfg);
  if (!freeIds.length) throw new Error("slot_taken");
  var pickId = pickStaffRoundRobin(freeIds);
  var picked = findStaffById(staffList, pickId);
  if (!picked) throw new Error("assign_failed");
  return picked;
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

var BOOKING_SLOTS_CACHE_PREFIX = "booking_slots_v3_";

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
    cache.remove("booking_slots_v1_" + d);
    cache.remove("booking_slots_v2_" + d);
  });
}

function stripSlotForClient(slot) {
  return {
    start: slot.start,
    end: slot.end,
    day: slot.day,
    day_label: slot.day_label,
    time_label: slot.time_label
  };
}

function getStaffSlackMention(staffId) {
  var id = String(staffId || "").trim();
  if (!id) return "";
  var list = getBookingStaffList();
  for (var i = 0; i < list.length; i++) {
    if (list[i].id !== id) continue;
    var uid = String(list[i].slack_user_id || "").trim();
    if (uid.indexOf("<@") === 0) return uid;
    if (uid.indexOf("U") === 0) return "<@" + uid + ">";
    return "";
  }
  return "";
}

function buildSlotsPayload(days) {
  var staffList = getBookingStaffList();
  var rawSlots = getAvailableSlots(days);
  var slots = [];
  for (var i = 0; i < rawSlots.length; i++) {
    slots.push(stripSlotForClient(rawSlots[i]));
  }
  return {
    ok: true,
    slots: slots,
    timezone: TZ,
    slot_minutes: bookingConfig().slotMinutes,
    staff_count: staffList.length,
    assignment: "merged_round_robin",
    allow_overlap: bookingConfig().allowOverlap,
    end_hour: bookingConfig().endHour,
    generated_at: Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX")
  };
}

function getAvailableSlots(daysAhead) {
  var cfg = bookingConfig();
  var staffList = getBookingStaffList();
  if (!staffList.length) throw new Error("no booking staff configured");

  var now = new Date();
  var earliest = new Date(now.getTime() + cfg.leadHours * 60 * 60 * 1000);
  var rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var busyMap = null;
  if (!cfg.allowOverlap) {
    var rangeEnd = new Date(rangeStart.getTime() + (daysAhead + 1) * 24 * 60 * 60 * 1000);
    busyMap = getStaffBusyMap(staffList, rangeStart, rangeEnd);
  }

  var slotMap = {};
  var slotMs = cfg.slotMinutes * 60 * 1000;

  for (var d = 0; d < daysAhead; d++) {
    var day = new Date(rangeStart.getTime() + d * 24 * 60 * 60 * 1000);
    if (!isWorkday(day)) continue;

    var win = getDayBookingWindow(day, cfg);
    for (var t = win.dayStart.getTime(); t + slotMs <= win.dayEnd.getTime(); t += slotMs) {
      var slotStart = new Date(t);
      var slotEnd = new Date(t + slotMs);
      if (slotStart < earliest) continue;

      var freeIds = staffFreeAtSlot(staffList, busyMap, slotStart, slotEnd, cfg);
      if (!freeIds.length) continue;

      var key = Utilities.formatDate(slotStart, TZ, "yyyy-MM-dd'T'HH:mm:ss");
      if (!slotMap[key]) {
        slotMap[key] = {
          start: key,
          end: Utilities.formatDate(slotEnd, TZ, "yyyy-MM-dd'T'HH:mm:ss"),
          day: formatDayKey(slotStart),
          day_label: formatDayLabel(slotStart),
          time_label: formatSlotLabel(slotStart),
          staff_ids: freeIds.slice()
        };
      } else {
        var merged = slotMap[key].staff_ids;
        for (var fi = 0; fi < freeIds.length; fi++) {
          if (merged.indexOf(freeIds[fi]) === -1) merged.push(freeIds[fi]);
        }
      }
    }
  }

  return Object.keys(slotMap)
    .sort()
    .map(function (k) {
      return slotMap[k];
    });
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
  var daysList = [3, 5];
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
  return getBookingStaffInfo();
}

/** 担当カレンダー一覧（BOOKING_STAFF_JSON 設定確認用） */
function getBookingStaffInfo() {
  var staffList = getBookingStaffList();
  var rows = [];
  for (var i = 0; i < staffList.length; i++) {
    var staff = staffList[i];
    var cal = getCalendarForStaff(staff);
    rows.push({
      id: staff.id,
      name: staff.name,
      calendar_id: staff.calendar_id,
      calendar_name: cal.getName(),
      timezone: cal.getTimeZone()
    });
  }
  var info = {
    ok: true,
    staff: rows,
    staff_count: rows.length,
    note:
      "BOOKING_STAFF_JSON に id/name/calendar_id を並べると空きをマージし、予約時にラウンドロビンで割当します。"
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
  var staff = resolveStaffForBooking(params, slotStart, slotEnd);
  var cal = getCalendarForStaff(staff);

  var name = params.calendar_guest_name || params["guest_name"] || "";
  var tel = params["your-tel"] || "";
  var lp = params["_lp"] || params["lp_id"] || "thanks";
  var title =
    "【LP面談・" +
    staff.name +
    "】" +
    (name || "お問い合わせ") +
    (tel ? " " + tel : "");
  var desc = [
    "予約元: LPサンクス（独自予約）",
    "担当: " + staff.name + " (" + staff.id + ")",
    "電話: " + tel,
    "LP: " + lp
  ].join("\n");

  var event = cal.createEvent(title, slotStart, slotEnd, {
    description: desc
  });

  params._event = "calendar_booked";
  params.calendar_event_id = event.getId();
  params.calendar_id = cal.getId();
  params.calendar_staff_id = staff.id;
  params.calendar_staff_name = staff.name;
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
    calendar_staff_id: staff.id,
    calendar_staff_name: staff.name,
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
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
