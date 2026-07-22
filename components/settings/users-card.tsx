import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AddUserForm } from "@/components/settings/add-user-form";
import type { AppUser, Role } from "@/types/domain";

const ROLE_BADGE: Record<Role, "default" | "secondary" | "outline"> = {
  owner: "default",
  manager: "secondary",
  agent: "outline",
};

export function UsersCard({
  users,
  editable,
}: {
  users: AppUser[];
  editable: boolean;
}) {
  const nameById = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  const managers = users.filter((u) => u.role === "manager" || u.role === "owner");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team</CardTitle>
        <CardDescription>Everyone with access to your agency&apos;s data.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Reports to</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">
                  {u.firstName} {u.lastName}
                </TableCell>
                <TableCell className="text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  <Badge variant={ROLE_BADGE[u.role]}>{u.role}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {u.managerId ? nameById.get(u.managerId) ?? "—" : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      {editable && <AddUserForm managers={managers} />}
    </Card>
  );
}
