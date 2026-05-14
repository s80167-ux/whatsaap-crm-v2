import React, { useEffect, useState } from 'react';
import { fetchMe, updateMyProfile, updateMyPassword } from '../api/auth';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Toast } from '../components/Toast';


const ProfilePage: React.FC = () => {
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
      .catch(() => setToast({ type: 'error', message: 'Failed to load profile.' }))
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
      setToast({ type: 'success', message: 'Profile updated successfully.' });
      setEditMode(false);
    } catch {
      setToast({ type: 'error', message: 'Failed to update profile.' });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordUpdate = async () => {
    if (newPassword !== confirmPassword) {
      setToast({ type: 'error', message: 'Passwords do not match.' });
      return;
    }
    setPasswordLoading(true);
    try {
      await updateMyPassword({ password: newPassword });
      setToast({ type: 'success', message: 'Password updated successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setToast({ type: 'error', message: 'Failed to update password.' });
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="workspace-block mx-auto mt-10 max-w-2xl p-6 shadow-soft">
      <h2 className="mb-6 text-2xl font-bold text-text">My Profile</h2>
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
              <span className="font-semibold text-text">Personal Information</span>
              {!editMode && (
                <Button onClick={() => setEditMode(true)}>
                  Edit Profile
                </Button>
              )}
            </div>
            <div className="space-y-3">
              <Input
                placeholder="Full Name"
                value={profile.fullName}
                onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                disabled={!editMode}
              />
              <Input
                placeholder="Email Address"
                value={profile.email}
                disabled
              />
              <Input
                placeholder="Phone Number"
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                disabled={!editMode}
              />
              <Input
                placeholder="Address"
                value={profile.address}
                onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                disabled={!editMode}
              />
            </div>
            {editMode && (
              <div className="mt-4 flex gap-2">
                <Button onClick={handleProfileSave} disabled={loading}>
                  Save Changes
                </Button>
                <Button variant="secondary" onClick={() => setEditMode(false)}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
        {/* Security & Password */}
        <div className="flex-1">
          <div className="workspace-subtle p-4">
            <div className="mb-2 font-semibold text-text">Security & Password</div>
            {/* Current password is not required for self password update in this API */}
            <Input
              placeholder="New Password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <Input
              placeholder="Confirm New Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <div className="mt-4 flex gap-2">
              <Button onClick={handlePasswordUpdate} disabled={passwordLoading}>
                Update Password
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
