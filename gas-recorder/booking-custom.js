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
  if (cfg.calendarId) {
    return CalendarApp.getCalendarById(cfg.calendarId);
  }
  return CalendarApp.getDefaultCalendar();
}

function jsonpResponse(callback, payload) {
  var safeCb = String(callback || "").replace(/[^\w$.]/g, "");
  if (!safeCb) return jsonOk(payload);
  return ContentService.createTextOutput(safeCb + "(" + JSON.stringify(payload) + ");")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function parseIsoToDate(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) throw new Error("invalid datetime");
  return d;
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
    var payload = {
      ok: true,
      slots: getAvailableSlots(days),
      timezone: TZ,
      slot_minutes: bookingConfig().slotMinutes
    };
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

function handleBookSlot(params) {
  try {
    var startIso = params.calendar_start || params.slot_start;
    var endIso = params.calendar_end || params.slot_end;
    if (!startIso || !endIso) return jsonError("missing slot");

    var slotStart = parseIsoToDate(startIso);
    var slotEnd = parseIsoToDate(endIso);
    var cal = getBookingCalendar();
    if (!cal) return jsonError("calendar not found");

    var busy = getBusyRanges(cal, slotStart, new Date(slotEnd.getTime() + 60000));
    if (!isSlotFree(slotStart, slotEnd, busy)) {
      return jsonError("slot_taken");
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

    return handleCalendarBooked(params);
  } catch (err) {
    return jsonError(err);
  }
}
