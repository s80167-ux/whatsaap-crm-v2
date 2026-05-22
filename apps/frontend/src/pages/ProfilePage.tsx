import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchMe, updateMyProfile, updateMyPassword } from '../api/auth';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Toast } from '../components/Toast';
import { LanguageSwitcher } from '../components/LanguageSwitcher';


const ProfilePage: React.FC = () => {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<{ fullName: string; email: string; avatarUrl: string | null; phone: string; address: string }>({ fullName: '', email: '', avatarUrl: null, phone: '', address: '' });
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchMe()
      .then((data) => setProfile({
        fullName: data.fullName || '',
        email: data.email,
        avatarUrl: data.avatarUrl ?? null,
        phone: data.phone || '',
        address: data.address || ''
      }))
      .catch(() => setToast({ type: 'error', message: t('profile.profileLoadFailed') }))
      .finally(() => setLoading(false));
  }, []);

  const handleProfileSave = async () => {
    setLoading(true);
    try {
      await updateMyProfile({
        fullName: profile.fullName,
        phone: profile.phone,
        address: profile.address
      });
      setToast({ type: 'success', message: t('profile.profileUpdatedSuccess') });
      setEditMode(false);
    } catch {
      setToast({ type: 'error', message: t('profile.profileSaveFailed') });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordUpdate = async () => {
    if (newPassword !== confirmPassword) {
      setToast({ type: 'error', message: t('profile.passwordMismatch') });
      return;
    }
    setPasswordLoading(true);
    try {
      await updateMyPassword({ password: newPassword });
      setToast({ type: 'success', message: t('profile.passwordUpdatedSuccess') });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setToast({ type: 'error', message: t('profile.passwordUpdateFailed') });
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="workspace-block mx-auto mt-10 max-w-2xl p-6 shadow-soft">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-text">{t('profile.myProfile')}</h2>
        <LanguageSwitcher />
      </div>
      {toast && <Toast message={toast.message} variant={toast.type} />}
      <div className="flex flex-col gap-8 md:flex-row">
        {/* Personal Information */}
        <div className="flex-1">
          <div className="mb-4 flex items-center gap-4">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="avatar" className="w-20 h-20 rounded-full object-cover" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted text-3xl font-bold text-muted-foreground">
                {profile.fullName.charAt(0)}
              </div>
            )}
            <div>
              <div className="text-lg font-semibold text-text">{profile.fullName}</div>
              <div className="text-text-muted">{profile.email}</div>
            </div>
          </div>
          <div className="workspace-subtle mb-4 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold text-text">{t('profile.personalInformation')}</span>
              {!editMode && (
                <Button onClick={() => setEditMode(true)}>
                  {t('profile.editProfile')}
                </Button>
              )}
            </div>
            <div className="space-y-3">
              <Input
                placeholder={t('common.fullName')}
                value={profile.fullName}
                onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                disabled={!editMode}
              />
              <Input
                placeholder={t('profile.emailAddress')}
                value={profile.email}
                disabled
              />
              <Input
                placeholder={t('common.phoneNumber')}
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                disabled={!editMode}
              />
              <Input
                placeholder={t('common.address')}
                value={profile.address}
                onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                disabled={!editMode}
              />
            </div>
            {editMode && (
              <div className="mt-4 flex gap-2">
                <Button onClick={handleProfileSave} disabled={loading}>
                  {t('common.saveChanges')}
                </Button>
                <Button variant="secondary" onClick={() => setEditMode(false)}>
                  {t('common.cancel')}
                </Button>
              </div>
            )}
          </div>
        </div>
        {/* Security & Password */}
        <div className="flex-1">
          <div className="workspace-subtle p-4">
            <div className="mb-2 font-semibold text-text">{t('profile.securityPassword')}</div>
            {/* Current password is not required for self password update in this API */}
            <Input
              placeholder={t('profile.newPassword')}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <Input
              placeholder={t('profile.confirmNewPassword')}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <div className="mt-4 flex gap-2">
              <Button onClick={handlePasswordUpdate} disabled={passwordLoading}>
                {t('profile.updatePassword')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
