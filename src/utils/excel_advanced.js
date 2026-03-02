import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

function dataUrlToBase64(dataUrl) {
  if (!dataUrl) return null;
  const idx = dataUrl.indexOf("base64,");
  if (idx === -1) return null;
  return dataUrl.slice(idx + "base64,".length);
}

function autosizeColumns(ws, maxWidth = 55) {
  ws.columns.forEach((col) => {
    let max = 10;
    col.eachCell({ includeEmpty: true }, (cell) => {
      const v = cell.value;
      const s = v == null ? "" : (typeof v === "object" ? JSON.stringify(v) : String(v));
      max = Math.max(max, s.length);
    });
    col.width = Math.min(maxWidth, max + 2);
  });
}

function headerStyle(row) {
  row.font = { bold: true };
  row.alignment = { vertical: "middle" };
}

function kmText(d) {
  if (d.transportMode !== "auto") return "";
  if (d.route?.distanceMeters == null) return "";
  const km = d.route.distanceMeters / 1000;
  return `${km.toFixed(km >= 100 ? 0 : 1)} km`;
}
function durText(d) {
  if (d.transportMode !== "auto") return "";
  if (d.route?.durationSeconds == null) return "";
  const s = d.route.durationSeconds;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h <= 0 ? `${m} min` : `${h}u ${m}m`;
}

export async function exportPlanToExcelWithDaySheets({
  tripName,
  days,
  dayLabelFn,
  totalAutoKmText,
  totalHotelCost,
  totalExtraCosts,
  totalLodgingCost,
  nightsCount,
  avgHotelPerNight,
  avgLodgingPerNight,
  mapImagesByDayId
}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Vakantieplanner";
  wb.created = new Date();

  const ws = wb.addWorksheet("Samenvatting", { views: [{ state: "frozen", ySplit: 2 }] });
  ws.addRow([ (tripName && String(tripName).trim()) ? String(tripName).trim() : "Reisplanning" ]);
  ws.mergeCells(1,1,1,17);
  ws.getRow(1).font = { bold: true, size: 16 };
  ws.getRow(1).alignment = { vertical: "middle" };

  ws.addRow([
    "Dag",
    "Datum",
    "Transport",
    "Locatie (start/verblijf)",
    "Via",
    "Eind",
    "Auto-km",
    "Auto-reistijd",
    "Hotel",
    "Hotel adres",
    "Ontbijt inbegrepen",
    "Hotel link",
    "Hotel kosten",
    "Extra kosten (omschrijving)",
    "Extra kosten (bedrag)",
    "Notities"
  ]);
  headerStyle(ws.getRow(2));

  for (const d of days) {
    const isFlight = d.transportMode === "vliegtuig";
    const isNone = d.transportMode === "geen";
    ws.addRow([
      d.dayNumber,
      dayLabelFn(d.dayNumber),
      d.transportMode,
      d.startText || "",
      isNone ? "" : (d.vias ?? []).map(v => v.text).filter(Boolean).join(" | "),
      isNone ? "" : (d.endText || ""),
      kmText(d),
      durText(d),
      d.hotelName || "",
      d.hotelAddress || "",
      d.breakfastIncluded ? "Ja" : "Nee",
      d.hotelPaid ? "Ja" : "Nee",
      d.hotelLink || "",
      d.hotelCost ?? "",
      d.extraCostLabel || "",
      d.extraCostAmount ?? "",
      d.notes || ""
    ]);
  }

  // hyperlinks hotel link column (13)
  ws.getColumn(13).eachCell((cell, rowNumber) => {
    if (rowNumber === 1) return;
    const v = cell.value;
    if (typeof v === "string" && v.trim().startsWith("http")) {
      cell.value = { text: v.trim(), hyperlink: v.trim() };
      cell.font = { color: { argb: "FF0000FF" }, underline: true };
    }
  });

  autosizeColumns(ws);

  const startRow = ws.rowCount + 2;
  ws.getCell(`A${startRow}`).value = "Totals";
  ws.getCell(`A${startRow}`).font = { bold: true };

  ws.getCell(`A${startRow+1}`).value = "Totaal auto-kilometers";
  ws.getCell(`B${startRow+1}`).value = totalAutoKmText || "";

  ws.getCell(`A${startRow+2}`).value = "Totaal hotelkosten";
  ws.getCell(`B${startRow+2}`).value = Number(totalHotelCost ?? 0);

  ws.getCell(`A${startRow+3}`).value = "Totaal extra kosten";
  ws.getCell(`B${startRow+3}`).value = Number(totalExtraCosts ?? 0);

  ws.getCell(`A${startRow+4}`).value = "Totaal verblijfskosten (hotel + extra)";
  ws.getCell(`B${startRow+4}`).value = Number(totalLodgingCost ?? 0);

  ws.getCell(`A${startRow+5}`).value = "Overnachtingen (met kosten)";
  ws.getCell(`B${startRow+5}`).value = Number(nightsCount ?? 0);

  ws.getCell(`A${startRow+6}`).value = "Gemiddeld hotel per overnachting";
  ws.getCell(`B${startRow+6}`).value = Number(avgHotelPerNight ?? 0);

  ws.getCell(`A${startRow+7}`).value = "Gemiddeld verblijf per overnachting";
  ws.getCell(`B${startRow+7}`).value = Number(avgLodgingPerNight ?? 0);

  
  // Flights section
  const flightsStart = startRow + 9;
  ws.getCell(`A${flightsStart}`).value = "Vluchten";
  ws.getCell(`A${flightsStart}`).font = { bold: true };

  ws.getRow(flightsStart+1).values = ["Dag","Datum","Segment","Van","Naar","Vluchtnummer","Vertrek","Aankomst"];
  headerStyle(ws.getRow(flightsStart+1));

  let fr = flightsStart+2;
  days.forEach(d=>{
    if(d.transportMode==="vliegtuig"){
      const segs = Array.isArray(d.flightSegments) && d.flightSegments.length ? d.flightSegments.slice(0,2) : [];
      const locs = [d.startText||"", ...(d.vias??[]).map(v=>v.text).filter(Boolean), d.endText||""].filter(Boolean);
      const transfer = locs.length >= 3 ? locs[1] : (locs.length >= 2 ? locs[1] : "");
      const from1 = locs[0] || "";
      const to1 = (segs.length >= 2 ? transfer : (locs[locs.length-1] || ""));
      const from2 = transfer;
      const to2 = locs[locs.length-1] || "";

      segs.forEach((s, idx) => {
        const has = (s.flightNumber||s.departTime||s.arriveTime);
        if(!has) return;
        const is2 = idx === 1;
        ws.getRow(fr).values=[
          d.dayNumber,
          dayLabelFn(d.dayNumber),
          is2 ? 2 : 1,
          is2 ? from2 : from1,
          is2 ? to2 : to1,
          s.flightNumber||"",
          s.departTime||"",
          s.arriveTime||""
        ];
        fr++;
      });
    }
  });

  // Day sheets
  for (const d of days) {
    const name = `Dag ${String(d.dayNumber).padStart(2, "0")}`;
    const dws = wb.addWorksheet(name);

    dws.mergeCells("A1", "F1");
    dws.getCell("A1").value = `${(tripName && String(tripName).trim()) ? String(tripName).trim() + " • " : ""}${name} • ${dayLabelFn(d.dayNumber)}`;
    dws.getCell("A1").font = { bold: true, size: 14 };

    const isFlight = d.transportMode === "vliegtuig";
    const isNone = d.transportMode === "geen";

    const rows = [
      ["Transport", d.transportMode],
      ["Locatie (start/verblijf)", d.startText || ""],
      ["Via", isNone ? "" : (d.vias ?? []).map(v => v.text).filter(Boolean).join(" | ")],
      ["Eind", isNone ? "" : (d.endText || "")],
      ["Auto-km", kmText(d)],
      ["Auto-reistijd", durText(d)],
            ["Hotel", d.hotelName || ""],
      ["Hotel adres", d.hotelAddress || ""],
      ["Ontbijt inbegrepen", d.breakfastIncluded ? "Ja" : "Nee"],
    ["Betaald", d.hotelPaid ? "Ja" : "Nee"],
      ["Hotel link", d.hotelLink || ""],
      ["Hotel kosten", d.hotelCost ?? ""],
      ["Extra kosten (omschrijving)", d.extraCostLabel || ""],
      ["Extra kosten (bedrag)", d.extraCostAmount ?? ""],
      ["Notities", d.notes || ""]
    ];

    let r = 3;
    for (const [k, v] of rows) {
      dws.getCell(`A${r}`).value = k;
      dws.getCell(`A${r}`).font = { bold: true };
      dws.getCell(`B${r}`).value = v;
      r++;
    }

    const hotelLinkRow = 3 + rows.findIndex(x => x[0] === "Hotel link");
    if (typeof d.hotelLink === "string" && d.hotelLink.trim().startsWith("http")) {
      const cell = dws.getCell(`B${hotelLinkRow}`);
      cell.value = { text: d.hotelLink.trim(), hyperlink: d.hotelLink.trim() };
      cell.font = { color: { argb: "FF0000FF" }, underline: true };
    }

    dws.getColumn(1).width = 28;
    dws.getColumn(2).width = 70;

    const dataUrl = mapImagesByDayId?.[d.id];
    const b64 = dataUrlToBase64(dataUrl);
    const imgTitleRow = r + 1;
    dws.getCell(`A${imgTitleRow}`).value = "Route / kaart (uitsnede)";
    dws.getCell(`A${imgTitleRow}`).font = { bold: true };

    if (b64) {
      const imageId = wb.addImage({ base64: b64, extension: "png" });
      dws.addImage(imageId, {
        tl: { col: 0, row: imgTitleRow },
        ext: { width: 960, height: 540 }
      });
    } else {
      dws.getCell(`B${imgTitleRow}`).value = "Geen afbeelding (locaties/route nog niet beschikbaar)";
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  saveAs(blob, "vakantieplanning_met_dagbladen.xlsx");
}
