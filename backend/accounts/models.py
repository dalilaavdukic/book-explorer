from django.contrib.auth.models import AbstractUser


# Custom from the first migration, so the user model can change later without
# migration surgery.
class User(AbstractUser):
    pass
