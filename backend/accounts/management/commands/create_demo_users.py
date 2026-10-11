from django.core.management.base import BaseCommand

from accounts.models import User

# For development and review only. The README warns never to use them in
# production.
DEMO_USERS = {"alice": "alice-password", "bob": "bob-password"}


class Command(BaseCommand):
    help = "Create the demo readers alice and bob. Existing users are left untouched."

    def handle(self, *args, **options):
        for username, password in DEMO_USERS.items():
            if User.objects.filter(username=username).exists():
                self.stdout.write(f"Skipped {username}: the user already exists.")
                continue
            User.objects.create_user(username=username, password=password)
            self.stdout.write(f"Created {username}.")
