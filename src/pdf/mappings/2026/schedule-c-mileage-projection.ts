/** Source values for the disabled final 2026 Schedule C physical candidate. */
import Decimal from "decimal.js";
import { calculateScheduleC } from "@/engine/schedules/schedule-c.js";
import { ScheduleCStandardMileageSchema, type TaxYearInput } from "@/models/inputs.js";
import { roundDollar } from "@/utils/decimal.js";
import { SCHEDULE_C_2026_CANDIDATE } from "./schedule-c-candidate.js";

export function projectScheduleC2026MileageFields(input: TaxYearInput): Record<string, string | boolean> {
  const parsed = ScheduleCStandardMileageSchema.safeParse(input.scheduleC?.standardMileage);
  if (!parsed.success || !parsed.data.partIV) throw new Error("Actual Schedule C Part IV answers are required");
  const log = parsed.data;
  const partIV = parsed.data.partIV;
  const result = calculateScheduleC(input, input.scheduleC);
  const line9 = result.lines.find(line => line.form === "Sched C" && line.line === "9");
  if (!line9) throw new Error("The Schedule C mileage calculation did not produce line 9");
  const businessMiles = log.entries.reduce((total, entry) => total.plus(entry.miles), new Decimal(0));
  const commutingMiles = new Decimal(log.commutingMiles);
  const otherMiles = new Decimal(log.otherPersonalMiles);
  if (![businessMiles, commutingMiles, otherMiles].every(amount => amount.isInteger())) {
    throw new Error("This Schedule C Part IV candidate requires actual whole miles");
  }
  const [year, month, day] = log.placedInService.split("-");
  const fields = SCHEDULE_C_2026_CANDIDATE.fields;
  return {
    [fields.line9]: roundDollar(line9.value).toFixed(0),
    [fields.vehiclePlacedMonth]: month,
    [fields.vehiclePlacedDay]: day,
    [fields.vehiclePlacedYear]: year,
    [fields.line44aBusinessMiles]: businessMiles.toFixed(0),
    [fields.line44bCommutingMiles]: commutingMiles.toFixed(0),
    [fields.line44cOtherMiles]: otherMiles.toFixed(0),
    [fields.line45Yes]: partIV.offDutyPersonalUseAvailable,
    [fields.line45No]: !partIV.offDutyPersonalUseAvailable,
    [fields.line46Yes]: partIV.otherPersonalVehicleAvailable,
    [fields.line46No]: !partIV.otherPersonalVehicleAvailable,
    [fields.line47aYes]: true,
    [fields.line47aNo]: false,
    [fields.line47bYes]: true,
    [fields.line47bNo]: false,
  };
}
