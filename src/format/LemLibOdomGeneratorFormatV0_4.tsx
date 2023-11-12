import { makeAutoObservable, reaction, action, intercept } from "mobx";
import { getAppStores } from "../core/MainApp";
import { EditableNumberRange, IS_MAC_OS, ValidateNumber, getMacHotKeyString, makeId } from "../core/Util";
import { Path, Segment, Vector } from "../core/Path";
import { UnitOfLength, UnitConverter, Quantity } from "../core/Unit";
import { GeneralConfig, PathConfig, convertGeneralConfigUOL } from "./Config";
import { Format, PathFileData } from "./Format";
import { Exclude, Expose, Type } from "class-transformer";
import { IsBoolean, IsObject, IsPositive, ValidateNested } from "class-validator";
import { PointCalculationResult, getPathPoints, getDiscretePoints, fromDegreeToRadian } from "../core/Calculation";
import { FieldImageOriginType, FieldImageSignatureAndOrigin, getDefaultBuiltInFieldImage } from "../core/Asset";
import { CancellableCommand, HistoryEventMap, UpdateProperties } from "../core/Command";
import { ObserverInput } from "../component/ObserverInput";
import { Box, Button, Typography } from "@mui/material";
import { euclideanRotation } from "../core/Coordinate";
import { CodePointBuffer, Int } from "../token/Tokens";
import { observer } from "mobx-react-lite";
import { enqueueErrorSnackbar, enqueueSuccessSnackbar } from "../app/Notice";
import { Logger } from "../core/Logger";
import { FormTags } from "react-hotkeys-hook/dist/types";
import { useCustomHotkeys } from "../core/Hook";

const logger = Logger("LemLib Odom Code Gen v0.4.x (inch)");

const GeneralConfigPanel = observer((props: { config: GeneralConfigImpl }) => {
  const { config } = props;

  const { app, confirmation, modals } = getAppStores();

  const isUsingEditor = !confirmation.isOpen && !modals.isOpen;

  const ENABLE_ON_NON_TEXT_INPUT_FIELDS = {
    preventDefaultOnlyIfEnabled: true,
    enableOnFormTags: ["input", "INPUT"] as FormTags[],
    // UX: It is okay to enable hotkeys on some input fields (e.g. checkbox, button, range)
    enabled: (kvEvt: KeyboardEvent) => {
      if (isUsingEditor === false) return false;
      if (kvEvt.target instanceof HTMLInputElement)
        return ["button", "checkbox", "radio", "range", "reset", "submit"].includes(kvEvt.target.type);
      else return true;
    }
  };

  const onCopyCode = action(() => {
    try {
      const code = config.format.exportCode();

      navigator.clipboard.writeText(code);

      enqueueSuccessSnackbar(logger, "Copied");
    } catch (e) {
      enqueueErrorSnackbar(logger, e);
    }
  });

  useCustomHotkeys("Shift+Mod+C", onCopyCode, ENABLE_ON_NON_TEXT_INPUT_FIELDS);

  const hotkey = IS_MAC_OS ? getMacHotKeyString("Shift+Mod+C") : "Shift+Ctrl+C";

  return (
    <>
      <Box className="panel-box">
        <Typography sx={{ marginTop: "16px" }}>Export Settings</Typography>
        <Box className="flex-editor-panel">
          <ObserverInput
            label="Chassis Name"
            getValue={() => config.chassisName}
            setValue={(value: string) => {
              app.history.execute(
                `Change chassis variable name`,
                new UpdateProperties(this as any, { chassisName: value })
              );
            }}
            isValidIntermediate={() => true}
            isValidValue={(candidate: string) => candidate !== ""}
            sx={{ marginTop: "16px" }}
          />
          <ObserverInput
            label="Movement Timeout"
            getValue={() => config.movementTimeout.toString()}
            setValue={(value: string) => {
              const parsedValue = parseInt(Int.parse(new CodePointBuffer(value))!.value);
              app.history.execute(
                `Change default movement timeout to ${parsedValue}`,
                new UpdateProperties(this as any, { movementTimeout: parsedValue })
              );
            }}
            isValidIntermediate={() => true}
            isValidValue={(candidate: string) => Int.parse(new CodePointBuffer(candidate)) !== null}
            sx={{ marginTop: "16px" }}
            numeric
          />
        </Box>
        <Box className="flex-editor-panel" sx={{ marginTop: "32px" }}>
          <Button variant="contained" title={`Copy Generated Code (${hotkey})`} onClick={onCopyCode}>
            Copy Code
          </Button>
        </Box>
      </Box>
    </>
  );
});

// observable class
class GeneralConfigImpl implements GeneralConfig {
  @IsPositive()
  @Expose()
  robotWidth: number = 12;
  @IsPositive()
  @Expose()
  robotHeight: number = 12;
  @IsBoolean()
  @Expose()
  robotIsHolonomic: boolean = false;
  @IsBoolean()
  @Expose()
  showRobot: boolean = false;
  @ValidateNumber(num => num > 0 && num <= 1000) // Don't use IsEnum
  @Expose()
  uol: UnitOfLength = UnitOfLength.Inch;
  @IsPositive()
  @Expose()
  pointDensity: number = 2; // inches
  @IsPositive()
  @Expose()
  controlMagnetDistance: number = 5 / 2.54;
  @Type(() => FieldImageSignatureAndOrigin)
  @ValidateNested()
  @IsObject()
  @Expose()
  fieldImage: FieldImageSignatureAndOrigin<FieldImageOriginType> =
    getDefaultBuiltInFieldImage().getSignatureAndOrigin();
  @Expose()
  chassisName: string = "chassis";
  @Expose()
  movementTimeout: number = 5000;
  @Expose()
  relativeCoords: boolean = true;
  @Exclude()
  private format_: LemLibOdomGeneratorFormatV0_4;

  constructor(format: LemLibOdomGeneratorFormatV0_4) {
    this.format_ = format;
    makeAutoObservable(this);

    reaction(
      () => this.uol,
      action((_: UnitOfLength, oldUOL: UnitOfLength) => {
        convertGeneralConfigUOL(this, oldUOL);
      })
    );

    intercept(this, "fieldImage", change => {
      const { assetManager } = getAppStores();

      if (assetManager.getAssetBySignature(change.newValue.signature) === undefined) {
        change.newValue = getDefaultBuiltInFieldImage().getSignatureAndOrigin();
      }

      return change;
    });
  }

  get format() {
    return this.format_;
  }

  getConfigPanel() {
    return <GeneralConfigPanel config={this} />;
  }
}

// observable class
class PathConfigImpl implements PathConfig {
  @Exclude()
  speedLimit: EditableNumberRange = {
    minLimit: { value: 0, label: "" },
    maxLimit: { value: 0, label: "" },
    step: 0,
    from: 0,
    to: 0
  };
  @Exclude()
  bentRateApplicableRange: EditableNumberRange = {
    minLimit: { value: 0, label: "" },
    maxLimit: { value: 0, label: "" },
    step: 0,
    from: 0,
    to: 0
  };
  @Exclude()
  maxDecelerationRate: number = 127;

  @Exclude()
  readonly format: LemLibOdomGeneratorFormatV0_4;

  @Exclude()
  public path!: Path;

  constructor(format: LemLibOdomGeneratorFormatV0_4) {
    this.format = format;
    makeAutoObservable(this);
  }

  getConfigPanel() {
    return (
      <>
        <Typography>(No setting)</Typography>
      </>
    );
  }
}

// observable class
export class LemLibOdomGeneratorFormatV0_4 implements Format {
  isInit: boolean = false;
  uid: string;

  private gc = new GeneralConfigImpl(this);
  private readonly events = new Map<keyof HistoryEventMap<CancellableCommand>, Set<Function>>();

  constructor() {
    this.uid = makeId(10);
    makeAutoObservable(this);
  }

  createNewInstance(): Format {
    return new LemLibOdomGeneratorFormatV0_4();
  }

  getName(): string {
    return "LemLib Odom Code Gen v0.4.x (inch)";
  }

  init(): void {
    if (this.isInit) return;
    this.isInit = true;
  }

  getGeneralConfig(): GeneralConfig {
    return this.gc;
  }

  createPath(...segments: Segment[]): Path {
    return new Path(new PathConfigImpl(this), ...segments);
  }

  getPathPoints(path: Path): PointCalculationResult {
    const result = getPathPoints(path, new Quantity(this.gc.pointDensity, this.gc.uol));
    return result;
  }

  recoverPathFileData(data: string): PathFileData {
    const lines = data
      .replace(/.*\.moveTo/g, "")
      .replace(/[();]/g, "")
      .split(/\r?\n/)
      .map(line => line.split(/[/s,]/));

    const values = lines
      .map(coords => new Vector(parseFloat(coords[0]), parseFloat(coords[1])))
      .filter(vec => !isNaN(vec.x) && !isNaN(vec.y));

    let path = this.createPath();
    for (let i = 1; i < values.length; i++) {
      const prev = values[i - 1];
      const curr = values[i];
      const segment = new Segment(new EndControl(prev.x, prev.y, 0), new EndControl(curr.x, curr.y, 0));
      path.segments.push(segment);
    }

    const paths = [path];
    return { gc: this.gc, paths };
  }

  exportCode(): string {
    const { app } = getAppStores();

    let rtn = "";
    const gc = app.gc as GeneralConfigImpl;

    const path = app.interestedPath();
    if (path === undefined) throw new Error("No path to export");
    if (path.segments.length === 0) throw new Error("No segment to export");

    const uc = new UnitConverter(this.gc.uol, UnitOfLength.Inch);
    const points = getDiscretePoints(path);

    let heading = 0;

    // ALGO: Offsets to convert the absolute coordinates to the relative coordinates LemLib uses
    let offsets = new Vector(0, 0);
    if (gc.relativeCoords) {
      const start = points[0];
      offsets = new Vector(start.x, start.y);
      if (start.heading !== undefined) {
        heading = fromDegreeToRadian(start.heading);
      }
    }

      // ALGO: Offsets to convert the absolute coordinates to the relative coordinates LemLib uses
      const offsets = new Vector(start.x, start.y);
      for (const point of points) {
        // ALGO: Only coordinate points are supported in LemLibOdom format
        const relative = euclideanRotation(heading, point.subtract(offsets));
        rtn += `${gc.chassisName}.moveTo(${uc.fromAtoB(relative.x).toUser()}, ${uc.fromAtoB(relative.y).toUser()}, ${
          gc.movementTimeout
        });\n`;
      }
    }

    return rtn;
  }

  exportPathFile(): string {
    const { app } = getAppStores();

    let rtn = this.exportCode();

    rtn += "\n";

    rtn += "#PATH.JERRYIO-DATA " + JSON.stringify(app.exportPathFileData());

    return rtn;
  }

  addEventListener<K extends keyof HistoryEventMap<CancellableCommand>, T extends CancellableCommand>(
    type: K,
    listener: (event: HistoryEventMap<T>[K]) => void
  ): void {
    if (!this.events.has(type)) this.events.set(type, new Set());
    this.events.get(type)!.add(listener);
  }

  removeEventListener<K extends keyof HistoryEventMap<CancellableCommand>, T extends CancellableCommand>(
    type: K,
    listener: (event: HistoryEventMap<T>[K]) => void
  ): void {
    if (!this.events.has(type)) return;
    this.events.get(type)!.delete(listener);
  }

  fireEvent(
    type: keyof HistoryEventMap<CancellableCommand>,
    event: HistoryEventMap<CancellableCommand>[keyof HistoryEventMap<CancellableCommand>]
  ) {
    if (!this.events.has(type)) return;
    for (const listener of this.events.get(type)!) {
      listener(event);
    }
  }
}
