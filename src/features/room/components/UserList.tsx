'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Crown, User, UserX } from 'lucide-react';
import { User as UserType } from '@/types';

interface UserListProps {
  users: UserType[];
  currentUserId: string;
  currentUserIsHost?: boolean;
  onPromoteUser?: (userId: string) => void;
  onKickUser?: (userId: string) => void;
  className?: string;
  speakingUserIds?: Set<string>;
}

export function UserList({
  users,
  currentUserId,
  currentUserIsHost,
  onPromoteUser,
  onKickUser,
  className,
  speakingUserIds,
}: UserListProps) {
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const sortedUsers = [...users].sort((a, b) => {
    // Host first, then alphabetical
    if (a.isHost !== b.isHost) {
      return a.isHost ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center space-x-4">
          <Users className="h-5 w-5" />
          <span className="text-xl font-semibold tracking-tighter">Participants</span>
          <Badge className="ml-auto">{users.length}</Badge>
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="space-y-6">
          {sortedUsers.map(user => {
            const isSpeaking = speakingUserIds?.has(user.id);
            return (
              <div
                key={user.id}
                className={`flex items-center space-x-4 rounded-md p-4 transition-colors ${
                  user.id === currentUserId ? 'border border-primary bg-primary-50' : 'hover:bg-muted/50'
                }`}
              >
                {/* Avatar and Speaking Indicator */}
                <div className="relative flex items-center justify-center">
                  {isSpeaking && (
                    <span
                      aria-hidden
                      className="absolute inset-0 animate-ping rounded-full opacity-60 ring-2 ring-success"
                    />
                  )}
                  <Avatar
                    className={`${
                      isSpeaking
                        ? 'shadow-sm ring-2 ring-success ring-offset-2 ring-offset-background transition-interactive'
                        : ''
                    } duration-150 transition-interactive`}
                    size="lg"
                  >
                    <AvatarFallback variant={user.id === currentUserId ? 'secondary' : 'default'}>
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="truncate font-bold tracking-tight">
                      {user.name}
                      {user.id === currentUserId && <span className="ml-1 text-muted-foreground">(You)</span>}
                    </span>
                    {user.isHost && <Crown className="h-4 w-4 flex-shrink-0 text-primary" />}
                  </div>

                  <div className="mt-1 flex items-center space-x-2">
                    <User className="h-4 w-4 text-neutral" />
                    <span className="tracking-tight text-neutral">{user.isHost ? 'Host' : 'Guest'}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  {/* Promote button for hosts to promote guests */}
                  {currentUserIsHost && !user.isHost && user.id !== currentUserId && onPromoteUser && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onPromoteUser(user.id)}
                      className="h-8 px-2"
                      title={`Promote ${user.name} to host`}
                    >
                      <Crown className="h-4 w-4" />
                    </Button>
                  )}

                  {/* Kick button for hosts to kick guests */}
                  {currentUserIsHost && !user.isHost && user.id !== currentUserId && onKickUser && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => onKickUser(user.id)}
                      className="h-8 px-2"
                      title={`Kick ${user.name} from room`}
                    >
                      <UserX className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {users.length === 0 && (
            <div className="py-4 text-center text-muted-foreground">
              <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p>Got no friends?</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
