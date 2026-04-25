import React, { useEffect, useState } from 'react';
import { fetchMe, updateMyProfile, updateMyPassword } from '../api/auth';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Toast } from '../components/Toast';


const ProfilePage: React.FC = () => {
  const [profile, setProfile] = useState({ fullName: '', email: '', avatarUrl: null, phone: '', address: '' });
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
        avatarUrl: data.avatarUrl || null,
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
    <div className="max-w-2xl mx-auto mt-10 p-6 bg-white rounded shadow">
      <h2 className="text-2xl font-bold mb-6">My Profile</h2>
      {toast && <Toast message={toast.message} variant={toast.type} />}
      <div className="flex flex-col md:flex-row gap-8">
        {/* Personal Information */}
        <div className="flex-1">
          <div className="flex items-center gap-4 mb-4">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="avatar" className="w-20 h-20 rounded-full object-cover" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center text-3xl font-bold">
                {profile.fullName.charAt(0)}
              </div>
            )}
            <div>
              <div className="font-semibold text-lg">{profile.fullName}</div>
              <div className="text-gray-500">{profile.email}</div>
            </div>
          </div>
          <div className="bg-gray-50 p-4 rounded mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold">Personal Information</span>
              {!editMode && (
                <Button size="sm" onClick={() => setEditMode(true)}>
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
              <div className="flex gap-2 mt-4">
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
          <div className="bg-gray-50 p-4 rounded">
            <div className="font-semibold mb-2">Security & Password</div>
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
            <div className="flex gap-2 mt-4">
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
