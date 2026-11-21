import React, { useEffect, useState } from "react";
import System from "../../../models/system";
import { AUTH_TOKEN } from "../../../utils/constants";
import paths from "../../../utils/paths";
import Modal from "@/components/lib/Modal";
import { useModal } from "@/hooks/useModal";
import RecoveryCodeModal from "@/components/Modals/DisplayRecoveryCodeModal";
import { useTranslation } from "react-i18next";
import PasswordInput from "@/components/lib/PasswordInput";

export default function SingleUserAuth() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [token, setToken] = useState(null);
  const [customAppName, setCustomAppName] = useState(null);

  const {
    isOpen: isRecoveryCodeModalOpen,
    openModal: openRecoveryCodeModal,
    closeModal: closeRecoveryCodeModal,
  } = useModal();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    const data = {};
    const form = new FormData(e.target);
    for (var [key, value] of form.entries()) data[key] = value;
    const { valid, token, message, recoveryCodes } =
      await System.requestToken(data);
    if (valid && !!token) {
      setToken(token);
      if (recoveryCodes) {
        setRecoveryCodes(recoveryCodes);
        openRecoveryCodeModal();
      } else {
        window.localStorage.setItem(AUTH_TOKEN, token);
        window.location = paths.home();
      }
    } else {
      setError(message);
    }
    setLoading(false);
  };

  const handleDownloadComplete = () => {
    setDownloadComplete(true);
  };

  useEffect(() => {
    if (downloadComplete && token) {
      window.localStorage.setItem(AUTH_TOKEN, token);
      window.location = paths.home();
    }
  }, [downloadComplete, token]);

  useEffect(() => {
    const fetchCustomAppName = async () => {
      const { appName } = await System.fetchCustomAppName();
      setCustomAppName(appName || "");
    };
    fetchCustomAppName();
  }, []);

  return (
    <>
      <form
        onSubmit={handleLogin}
        className="flex w-full max-w-sm flex-col items-center"
      >
        <div className="flex items-start justify-between pt-7 pb-9">
          <div className="flex items-center flex-col gap-y-[18px] max-w-full">
            <div className="flex gap-x-1">
              <h3 className="text-white light:text-slate-950 text-3xl leading-[28px] font-medium text-center white-space-nowrap block">
                {t("login.multi-user.welcome")}
              </h3>
            </div>
            <p className="text-zinc-400 light:text-zinc-600 text-sm text-center">
              {t("login.sign-in", { appName: customAppName || "AnythingLLM" })}
            </p>
          </div>
        </div>
        <div className="w-full px-4 sm:px-12">
          <div className="w-full flex flex-col gap-y-3">
            <div className="w-full flex flex-col gap-y-2">
              <label htmlFor="login-password" className="text-zinc-300 light:text-slate-800 text-sm">
                Password
              </label>
              <PasswordInput
                id="login-password"
                name="password"
                containerClassName="w-full"
                className="border-none bg-zinc-800 light:bg-slate-200 text-zinc-200 light:text-zinc-600 text-sm rounded-lg p-2.5 w-full h-[34px] focus:outline-none focus:ring-1 focus:ring-sky-300"
                required={true}
                autoComplete="current-password"
              />
            </div>
            {error && <p role="alert" className="text-red-400 text-sm">Error: {error}</p>}
          </div>
        </div>
        <div className="flex items-center px-4 sm:px-12 mt-9 space-x-2 w-full flex-col gap-y-6">
          <button
            disabled={loading}
            type="submit"
            className="text-zinc-950 bg-white hover:bg-zinc-300 light:bg-sky-200 light:text-slate-950 light:hover:bg-sky-300 text-sm font-semibold rounded-lg border-primary-button h-[34px] w-full"
          >
            {loading
              ? t("login.multi-user.validating")
              : t("login.multi-user.login")}
          </button>
        </div>
      </form>

      <Modal
        isOpen={isRecoveryCodeModalOpen}
        noPortal={true}
        onClose={closeRecoveryCodeModal}
      >
        <RecoveryCodeModal
          recoveryCodes={recoveryCodes}
          onDownloadComplete={handleDownloadComplete}
          onClose={closeRecoveryCodeModal}
        />
      </Modal>
    </>
  );
}
