import DeleteIcon from "@mui/icons-material/Delete";
import FiberManualRecordOutlinedIcon from "@mui/icons-material/FiberManualRecordOutlined";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";

import { action, reaction } from "mobx";
import { observer } from "mobx-react-lite";
import { TreeItem } from "@mui/lab";
import { EndPointControl, Path } from "../types/Path";
import { useRef } from "react";
import { InteractiveEntity } from "../types/Canvas";
import { RemovePathsAndEndControls, UpdateInteractiveEntities, UpdateProperties } from "../types/Command";
import { useAppStores } from "./MainApp";

export interface PathTreeProps {
  path: Path;
}

export interface PathTreeItemLabelProps extends PathTreeProps {
  entity: InteractiveEntity;
  parent?: InteractiveEntity;
  canDelete?: boolean;
  children?: React.ReactNode;
}

export function getPathNameRegex() {
  return new RegExp(/^[^<>\r\n]+$/g); /* eslint-disable-line */
}

const PathTreeItemLabel = observer((props: PathTreeItemLabelProps) => {
  const { app } = useAppStores();

  const entity = props.entity;
  const parent = props.parent;

  function onVisibleClick(event: React.MouseEvent<SVGSVGElement, MouseEvent>) {
    const setTo = !entity.visible;
    const affected = app.isSelected(entity) ? app.selectedEntities : [entity];

    app.history.execute(
      `Update entities visibility to ${setTo}`,
      new UpdateInteractiveEntities(affected, { visible: setTo }),
      0 // Disable merge
    );
  }

  function onLockClick(event: React.MouseEvent<SVGSVGElement, MouseEvent>) {
    const setTo = !entity.lock;
    const affected = app.isSelected(entity) ? app.selectedEntities : [entity];

    app.history.execute(
      `Update entities lock to ${setTo}`,
      new UpdateInteractiveEntities(affected, { lock: setTo }),
      0 // Disable merge
    );
  }

  function onDeleteClick(event: React.MouseEvent<SVGSVGElement, MouseEvent>) {
    const target = entity.uid; // ALGO: use uid to have better performance
    const affected = app.isSelected(target) ? app.selectedEntityIds : [target];
    const command = new RemovePathsAndEndControls(app.paths, affected);
    app.history.execute(`Remove paths and end controls`, command);
    for (const id of command.removedEntities) {
      app.unselect(id);
      app.removeExpanded(id);
    }
  }

  return (
    <div className="tree-node-label">
      {props.children}
      <span style={{ display: "inline-block", marginRight: "1em" }}></span>
      {entity.visible ? (
        parent !== undefined && parent.visible === false ? (
          <FiberManualRecordOutlinedIcon className="tree-node-func-icon show" onClick={action(onVisibleClick)} />
        ) : (
          <VisibilityIcon className="tree-node-func-icon" onClick={action(onVisibleClick)} />
        )
      ) : (
        <VisibilityOffOutlinedIcon className="tree-node-func-icon show" onClick={action(onVisibleClick)} />
      )}
      {entity.lock === false ? (
        parent !== undefined && parent.lock === true ? (
          <FiberManualRecordOutlinedIcon className="tree-node-func-icon show" onClick={action(onLockClick)} />
        ) : (
          <LockOpenIcon className="tree-node-func-icon" onClick={action(onLockClick)} />
        )
      ) : (
        <LockOutlinedIcon className="tree-node-func-icon show" onClick={action(onLockClick)} />
      )}
      {props.canDelete ? <DeleteIcon className="tree-node-func-icon" onClick={action(onDeleteClick)} /> : null}
    </div>
  );
});

const PathTreeItem = observer((props: PathTreeProps) => {
  const { app } = useAppStores();

  const path = props.path;

  const initialValue = useRef(path.name);
  const lastValidName = useRef(path.name);

  function onPathNameChange(event: React.FormEvent<HTMLSpanElement>) {
    const candidate = event.currentTarget.innerText;
    if (!getPathNameRegex().test(candidate) && candidate.length !== 0) {
      event.preventDefault();

      event.currentTarget.innerText = lastValidName.current;
    } else {
      lastValidName.current = event.currentTarget.innerText;
    }
  }

  function onPathNameKeyDown(event: React.KeyboardEvent<HTMLSpanElement>) {
    if (event.code === "Enter" || event.code === "NumpadEnter") {
      event.preventDefault();
      event.currentTarget.blur();

      onPathNameConfirm(event);
    }
  }

  function onPathNameConfirm(event: React.SyntheticEvent<HTMLSpanElement, Event>) {
    if (event.currentTarget.innerText === "") event.currentTarget.innerText = initialValue.current;
    const pathName = (initialValue.current = lastValidName.current = event.currentTarget.innerText);

    app.history.execute(`Update path name to ${pathName}`, new UpdateProperties(path, { name: pathName }));
  }

  reaction(
    () => path.name,
    name => {
      initialValue.current = name;
    }
  );

  return (
    <TreeItem
      nodeId={path.uid}
      label={
        <PathTreeItemLabel entity={path} canDelete {...props}>
          <span
            contentEditable
            style={{ display: "inline-block" }}
            onInput={e => onPathNameChange(e)}
            onKeyDown={action(onPathNameKeyDown)}
            onBlur={action(onPathNameConfirm)}
            suppressContentEditableWarning={true}
            dangerouslySetInnerHTML={{ __html: initialValue.current }} // SECURITY: Beware of XSS attack from the path file
            onClick={e => e.preventDefault()}
          />
        </PathTreeItemLabel>
      }>
      {path.controls.map(control => (
        <TreeItem
          nodeId={control.uid}
          key={control.uid}
          label={
            control instanceof EndPointControl ? (
              <PathTreeItemLabel entity={control} parent={path} canDelete {...props}>
                <span>End Control</span>
              </PathTreeItemLabel>
            ) : (
              <PathTreeItemLabel entity={control} parent={path} {...props}>
                <span>Control</span>
              </PathTreeItemLabel>
            )
          }
        />
      ))}
    </TreeItem>
  );
});

export { PathTreeItem };
