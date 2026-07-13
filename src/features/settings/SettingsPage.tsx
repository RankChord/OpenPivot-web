import clsx from "clsx";
import { Camera, Check, ChevronRight, ImagePlus, LogOut, Save, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { AppContextValue } from "../../app/AppContext";
import { sanitizeUserProfile } from "../../app/userProfile";
import { ActorAvatar } from "../../components/avatar/ActorAvatar";
import { PageTitle } from "../../components/feedback/Feedback";
import type { IdentityDisclosure, UserProfile } from "../../domain/models";

const cropFrameSize = 280;

export function SettingsPage({ app }: { app: AppContextValue }) {
  const [draft, setDraft] = useState<UserProfile>(app.userProfile);
  const [saved, setSaved] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropScale, setCropScale] = useState(1);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [dragState, setDragState] = useState<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const normalized = useMemo(() => sanitizeUserProfile(draft), [draft]);
  const changed = JSON.stringify(normalized) !== JSON.stringify(app.userProfile);
  const canLogout = app.session.status === "authenticated";
  const userId = app.session.status === "authenticated"
    ? app.session.username || (app.session.userId === "me" ? "me" : "后端未返回注册 ID")
    : "未登录";

  useEffect(() => {
    setDraft(app.userProfile);
  }, [app.userProfile]);

  function update<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setSaved(false);
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function saveProfile() {
    app.setUserProfile(normalized);
    setSaved(true);
  }

  function openAvatarPicker() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    fileInputRef.current?.click();
  }

  function readAvatarFile(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") return;
      setCropSrc(reader.result);
      setCropScale(1);
      setCropOffset({ x: 0, y: 0 });
    });
    reader.readAsDataURL(file);
  }

  function startCropDrag(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: cropOffset.x,
      originY: cropOffset.y
    });
  }

  function moveCropDrag(event: PointerEvent<HTMLDivElement>) {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    setCropOffset({
      x: dragState.originX + event.clientX - dragState.startX,
      y: dragState.originY + event.clientY - dragState.startY
    });
  }

  function endCropDrag(event: PointerEvent<HTMLDivElement>) {
    if (dragState?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      setDragState(null);
    }
  }

  function saveCroppedAvatar() {
    if (!cropSrc) return;
    const image = new Image();
    image.addEventListener("load", () => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 320;
      const context = canvas.getContext("2d");
      if (!context) return;
      const baseScale = Math.max(cropFrameSize / image.naturalWidth, cropFrameSize / image.naturalHeight);
      const totalScale = baseScale * cropScale;
      const sourceSize = cropFrameSize / totalScale;
      const sourceX = clamp((image.naturalWidth - sourceSize) / 2 - cropOffset.x / totalScale, 0, image.naturalWidth - sourceSize);
      const sourceY = clamp((image.naturalHeight - sourceSize) / 2 - cropOffset.y / totalScale, 0, image.naturalHeight - sourceSize);
      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, canvas.width, canvas.height);
      update("avatarUrl", canvas.toDataURL("image/png"));
      setCropSrc(null);
    });
    image.src = cropSrc;
  }

  return (
    <section className="center-page page-fade">
      <div className="main-column narrow">
        <PageTitle title="我的" subtitle="管理你在 Pivot 协作网络中的公开资料。" />

        <div className="profile-editor">
          <section className="profile-card profile-card-rich">
            <button className="avatar-edit-button" type="button" onClick={openAvatarPicker} aria-label="更换头像">
              <ActorAvatar id={app.environment.currentUserId} size="lg" src={normalized.avatarUrl} alt={displayName(app, normalized)} />
              <span><Camera size={15} /></span>
            </button>
            <span>
              <strong>{displayName(app, normalized)}</strong>
              <small>ID {userId}</small>
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={(event) => readAvatarFile(event.target.files?.[0])}
            />
          </section>

          <section className="profile-form">
            <h2>基础资料</h2>
            <label>
              <span>名称</span>
              <input value={draft.displayName} onChange={(event) => update("displayName", event.target.value)} placeholder={app.session.status === "authenticated" ? app.session.username || "你的显示名称" : "你的显示名称"} />
            </label>
            <label>
              <span>介绍</span>
              <textarea value={draft.bio} onChange={(event) => update("bio", event.target.value)} placeholder="介绍你的职责、能力或协作偏好" />
            </label>
            <label>
              <span>地区</span>
              <input value={draft.region} onChange={(event) => update("region", event.target.value)} placeholder="例如：上海、远程、UTC+8" />
            </label>
          </section>

          <section className="profile-form">
            <h2>身份显示</h2>
            <button className="profile-choice-card" type="button" onClick={() => setIdentityOpen(true)} aria-label="更换身份显示">
              <span>
                <strong>{identityTitle(draft.identity)}</strong>
                <small>{identityDescription(draft.identity)}</small>
              </span>
              <ChevronRight size={16} />
            </button>
          </section>

          <div className="button-row">
            <button className="primary-button" disabled={!changed} onClick={saveProfile}>
              <Save size={16} />
              {saved ? "已保存" : "保存资料"}
            </button>
            <button className="danger-button" disabled={!canLogout} title={canLogout ? undefined : "当前没有已登录会话"} onClick={() => void app.logout()}>
              <LogOut size={16} />
              {canLogout ? "退出登录" : "未登录"}
            </button>
          </div>
        </div>
      </div>

      {identityOpen && (
        <IdentityDialog
          current={draft.identity}
          onClose={() => setIdentityOpen(false)}
          onSelect={(value) => {
            update("identity", value);
            setIdentityOpen(false);
          }}
        />
      )}
      {cropSrc && (
        <div className="modal-scrim" role="dialog" aria-modal="true" aria-label="裁剪头像">
          <div className="avatar-crop-dialog">
            <header>
              <span>
                <strong>裁剪头像</strong>
                <small>拖动图片并调整缩放，保存后会作为你的公开头像。</small>
              </span>
              <button type="button" onClick={() => setCropSrc(null)} aria-label="关闭裁剪头像"><X size={16} /></button>
            </header>
            <div
              className="avatar-crop-frame"
              onPointerDown={startCropDrag}
              onPointerMove={moveCropDrag}
              onPointerUp={endCropDrag}
              onPointerCancel={endCropDrag}
            >
              <img
                src={cropSrc}
                alt=""
                draggable={false}
                style={{ transform: `translate(${cropOffset.x}px, ${cropOffset.y}px) scale(${cropScale})` }}
              />
            </div>
            <label className="avatar-crop-slider">
              <span>缩放</span>
              <input min="1" max="2.8" step="0.05" type="range" value={cropScale} onChange={(event) => setCropScale(Number(event.target.value))} />
            </label>
            <div className="button-row">
              <button className="quiet-button" type="button" onClick={() => setCropSrc(null)}>取消</button>
              <button className="primary-button" type="button" onClick={saveCroppedAvatar}>
                <ImagePlus size={16} />
                使用头像
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function IdentityDialog({ current, onClose, onSelect }: {
  current: IdentityDisclosure;
  onClose: () => void;
  onSelect: (value: IdentityDisclosure) => void;
}) {
  return (
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-label="更换身份显示">
      <div className="identity-dialog">
        <header>
          <span>
            <strong>身份显示</strong>
            <small>该标记只用于协作者区域的公开展示。</small>
          </span>
          <button type="button" onClick={onClose} aria-label="关闭身份显示"><X size={16} /></button>
        </header>
        <div className="identity-tab-list" role="tablist" aria-label="身份显示选项">
          {(["human", "agent", "private"] as const).map((value) => (
            <button
              key={value}
              className={clsx(current === value && "active")}
              type="button"
              role="tab"
              aria-selected={current === value}
              onClick={() => onSelect(value)}
            >
              <span>
                <strong>{identityTitle(value)}</strong>
                <small>{identityDescription(value)}</small>
              </span>
              {current === value && <Check size={16} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function identityTitle(identity: IdentityDisclosure) {
  if (identity === "human") return "人类";
  if (identity === "agent") return "智能体";
  return "不便透露";
}

function identityDescription(identity: IdentityDisclosure) {
  if (identity === "human") return "在协作者名称旁显示“人类”。";
  if (identity === "agent") return "在协作者名称旁显示“智能体”。";
  return "不展示身份标记。";
}

function displayName(app: AppContextValue, profile: UserProfile) {
  if (profile.displayName) return profile.displayName;
  if (app.session.status === "authenticated") return app.session.username || `用户 ${app.session.userId}`;
  return "未登录";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
