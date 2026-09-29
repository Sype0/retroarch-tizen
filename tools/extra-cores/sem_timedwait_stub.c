/* Emscripten's libc has no sem_timedwait without pthreads. GLideN64 only
   uses it for its threaded GL mode, which a single-threaded web build never
   enables; fall back to a non-blocking wait. */
#include <semaphore.h>
#include <time.h>

int sem_timedwait(sem_t *sem, const struct timespec *abstime)
{
   (void)abstime;
   return sem_trywait(sem);
}
